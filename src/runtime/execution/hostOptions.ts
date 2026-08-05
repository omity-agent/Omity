import type { HostObserver } from "../context";
import type { LoadedMcp } from "../../infrastructure/mcp/loadTools";
import type { ProcessOwner } from "../../infrastructure/process/ownership";
import type { SettingsContext } from "../../infrastructure/configuration/settings/context";

export interface HostControls {
  cancelTool: (callId: string) => boolean;
}
export interface HostRunOptions {
  controller?: AbortController;
  cwd?: string;
  mcp?: (profiles: string[]) => Promise<LoadedMcp>;
  observer?: HostObserver;
  onReady?: (controls: HostControls) => void;
  owner?: ProcessOwner;
  quiet?: boolean;
  recoverInterrupted?: boolean;
  settingsContext?: SettingsContext;
  stoppingController?: AbortController;
  wake?: (delayMs: number) => Promise<void>;
  wireSigint?: boolean;
}
