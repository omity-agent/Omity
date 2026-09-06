import { AIMessage } from "@langchain/core/messages";
import { createTitleTool } from "../../../src/infrastructure/toolbox/validateTitle";
import { createToolInvoker } from "../../../src/agent/toolExecution";
import { defaultBuiltIns } from "../../support/builtins";
import { randomUUID } from "node:crypto";
import { renameMcpTools } from "../../../src/infrastructure/mcp/tools/descriptions";
import { testSettings } from "../../support/settings";

export async function recordedTitle(
  title: string,
  options: { freeform?: boolean; name?: string } = {},
) {
  const tool = createTitleTool(defaultBuiltIns().update_title!);
  renameMcpTools([tool], { [tool.name]: options.name ?? tool.name });
  const call = {
      args: options.freeform ? { input: title } : { title },
      id: randomUUID(),
      ...(options.freeform ? { isCustomTool: true } : {}),
      name: tool.name,
    },
    invoke = createToolInvoker([tool], {
      freeformToolParameters: options.freeform ? new Map([[tool.name, "title"]]) : new Map(),
      sessionId: "session",
      settings: testSettings(),
    });
  return [new AIMessage({ content: "", tool_calls: [call] }), await invoke(call, {})] as const;
}
