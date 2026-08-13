import { AppRegistry, type RegisteredSession } from "./registry";
import type { Control, Settings } from "../types";
import type { MessageSubmission, SessionSubmission } from "./attachments/contract";
import { type ProcessOwner, appOwner } from "../infrastructure/process/ownership";
import {
  type SettingsContext,
  availableSettingsProfiles,
  createSettingsContext,
  prioritizeSettingsProfile,
  settingsProfileNames,
} from "../infrastructure/configuration/settings/context";
import { controllerHostEvents, controllerSessionInfo } from "./controllerHostEvents";
import { createAppFork, createAppSession } from "./runtime/sessionActions";
import { hasLiveHostLease, recoverAppSessions } from "./runtime/recovery";
import { loadSessionEventCursor, loadSessionTranscript } from "./transcript";
import { readSessionDraft, writeSessionDraft } from "./composerDraft";
import { AppEvents } from "./events";
import { AppHosts } from "./hosts";
import type { AppInstanceOwner } from "./runtime/instanceLock";
import { AskUserRuntime } from "../infrastructure/toolbox/runtime";
import { AsyncFileDialog } from "@bindrs/rfd";
import type { FileLinkAction } from "../fileLinks/types";
import { activateFileLink } from "./fileLinks/launch";
import { cancelSessionTool } from "./sessionCommands";
import { createAppMcp } from "./runtime/mcp";
import { deleteHostSession } from "../sessionStorage";
import { enqueueMessageWithAttachments } from "./attachments/message";
import { loadSettings } from "../infrastructure/configuration/settings/load";
import { setSessionControl } from "../client";

export class AppController {
  readonly events: AppEvents;
  private readonly settings: Settings;
  private readonly registry: AppRegistry;
  private readonly hosts: AppHosts;
  private readonly askUser: AskUserRuntime;
  private readonly settingsContext: SettingsContext;
  constructor(
    private readonly appRoot: string,
    options: {
      abandonedOwner?: AppInstanceOwner;
      owner?: ProcessOwner;
      settingsContext?: SettingsContext;
    } = {},
  ) {
    this.settingsContext = options.settingsContext ?? createSettingsContext(appRoot);
    this.settings = loadSettings(appRoot, { settingsContext: this.settingsContext });
    const discovered = new AppRegistry();
    recoverAppSessions(discovered.list(), options.abandonedOwner);
    this.registry = new AppRegistry();
    this.events = new AppEvents();
    this.askUser = new AskUserRuntime((sessionId) => this.publishChange(sessionId));
    const owner = options.owner ?? appOwner(),
      mcp = createAppMcp(appRoot, this.settings.logging.level, this.settingsContext, this.askUser);
    this.hosts = new AppHosts(
      appRoot,
      controllerHostEvents(
        this.events,
        (id) => this.sessionInfo(this.registry.require(id)),
        (id) => {
          this.publishChange(id);
        },
      ),
      owner,
      this.settings.host.shutdownTimeoutMs,
      mcp,
      this.settingsContext,
    );
  }
  close = () => this.hosts.close();
  bootstrap() {
    return {
      attachments: this.settings.attachments,
      cwd: this.appRoot,
      frontend: this.settings.frontend,
      profiles: {
        available: availableSettingsProfiles(this.settingsContext),
      },
      sessions: this.sessions(),
    };
  }
  sessions() {
    return this.registry.list().map((session) => this.sessionInfo(session));
  }
  assertSession(sessionId: string) {
    this.registry.require(sessionId);
  }
  async pickWorkspace() {
    const directory = await new AsyncFileDialog().setTitle("选择工作目录").pickFolder();
    return directory?.path() ?? null;
  }
  async activateFileLink(sessionId: string, path: string, action: FileLinkAction) {
    this.registry.require(sessionId);
    return { path: await activateFileLink(path, action) };
  }
  async createSession(submission: SessionSubmission) {
    const sessionContext = prioritizeSettingsProfile(this.settingsContext, submission.profile),
      profiles = settingsProfileNames(sessionContext),
      sessionSettings = loadSettings(this.appRoot, { settingsContext: sessionContext }),
      created = await createAppSession(this.appRoot, submission, sessionSettings, profiles),
      session = this.registry.refresh(created.sessionId);
    await this.hosts.start(created.sessionId, created.workspace, "load");
    const info = this.sessionInfo(session);
    this.events.notifySession(info);
    return info;
  }
  async sendMessage(sessionId: string, submission: MessageSubmission) {
    const session = this.registry.require(sessionId),
      result = await enqueueMessageWithAttachments(
        this.settings,
        sessionId,
        submission.content,
        submission.draftRevision,
        submission.submissionId,
        submission.attachments,
        () => this.ensureHost(session),
      );
    this.hosts.clearError(sessionId);
    this.publishChange(sessionId);
    return result;
  }
  composerDraft(sessionId: string) {
    this.registry.require(sessionId);
    return readSessionDraft(sessionId);
  }
  saveComposerDraft(sessionId: string, content: string, revision: number) {
    this.registry.require(sessionId);
    return writeSessionDraft(sessionId, content, revision);
  }
  async control(sessionId: string, control: Control) {
    const session = this.registry.require(sessionId);
    if (control === "running" || control === "step") {
      await this.ensureHost(session);
    }
    const result = setSessionControl(sessionId, control);
    this.publishChange(sessionId);
    return result;
  }
  cancelTool(sessionId: string, toolCallId: string) {
    this.registry.require(sessionId);
    const result = cancelSessionTool(this.hosts, sessionId, toolCallId);
    this.publishChange(sessionId);
    return result;
  }
  answerTool(sessionId: string, toolCallId: string, answer: unknown) {
    this.registry.require(sessionId);
    return this.askUser.answer(sessionId, toolCallId, answer);
  }
  async forkSession(sessionId: string, beforeMessageId: number) {
    const session = this.registry.require(sessionId),
      id = await createAppFork({
        beforeMessageId,
        pauseSource: () => this.control(sessionId, "pause"),
        profiles: session.profiles,
        sourceSessionId: sessionId,
        workspace: session.workspace,
      }),
      targetSession = this.registry.refresh(id);
    this.hosts.clearError(id);
    const info = this.sessionInfo(targetSession);
    this.events.notifySession(info);
    return info;
  }
  async deleteSession(sessionId: string) {
    this.registry.require(sessionId);
    await this.hosts.stop(sessionId);
    deleteHostSession(sessionId);
    this.hosts.clearError(sessionId);
    this.registry.remove(sessionId);
    this.events.notifyDeleted(sessionId);
    return { deleted: sessionId };
  }
  transcript(sessionId: string) {
    this.registry.require(sessionId);
    return loadSessionTranscript(sessionId);
  }
  eventCursor(sessionId: string) {
    this.registry.require(sessionId);
    return loadSessionEventCursor(sessionId);
  }
  private ensureHost(session: RegisteredSession) {
    if (!this.hosts.has(session.id) && hasLiveHostLease(session.id)) {
      return Promise.resolve();
    }
    return this.hosts.ensure(session.id, session.workspace);
  }
  private publishChange(sessionId: string) {
    this.events.wake(sessionId);
    const info = this.sessionInfo(this.registry.refresh(sessionId));
    this.events.notifySession(info);
    this.events.invalidateTranscript(sessionId, this.eventCursor(sessionId));
  }
  private sessionInfo(session: RegisteredSession) {
    return controllerSessionInfo(session, this.hosts, this.askUser);
  }
}
