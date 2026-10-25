import { requestHostToolCancellation } from "../storedSessions";
import type { AppHosts } from "./hosts";

export function cancelSessionTool(hosts: AppHosts, sessionId: string, toolCallId: string) {
  requestHostToolCancellation(sessionId, toolCallId);
  hosts.cancelTool(sessionId, toolCallId);
  return { toolCallId };
}
