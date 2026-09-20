import type { AppHosts } from "./hosts";
import { requestHostToolCancellation } from "../storedSessions";

export function cancelSessionTool(hosts: AppHosts, sessionId: string, toolCallId: string) {
  requestHostToolCancellation(sessionId, toolCallId);
  hosts.cancelTool(sessionId, toolCallId);
  return { toolCallId };
}
