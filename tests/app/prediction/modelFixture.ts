import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { PredictionService } from "../../../src/app/prediction/service";
import { createTestDirectory } from "../../support/artifacts";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { testSettings } from "../../support/settings";
import { z } from "zod";

export async function createPredictionFixture() {
  const previousHome = process.env["OMITY_HOME"],
    home = createTestDirectory("forecast-home");
  process.env["OMITY_HOME"] = home;
  const requests: Record<string, unknown>[] = [],
    replies = ["请继续实现", "先解释一下设计"],
    apiKeyEnv = `PREDICTION_${randomUUID()}`,
    sessionId = randomUUID(),
    paths = sessionPaths(sessionId),
    database = new AgentDatabase(paths.dbPath);
  let respond = () => Promise.resolve(Response.json(completion(replies)));
  const server = Bun.serve({
      fetch: async (request) => {
        requests.push(z.record(z.string(), z.unknown()).parse(await request.json()));
        return respond();
      },
      hostname: "127.0.0.1",
      port: 0,
    }),
    settings = testSettings();
  process.env[apiKeyEnv] = "local-test";
  settings.prediction = {
    enabled: true,
    maxUserMessageTokens: 200,
    model: {
      ...settings.model,
      adapter: "completions",
      apiKeyEnv,
      baseURL: new URL("/v1", server.url).href,
    },
    outputCount: replies.length,
    refreshIntervalHours: 1,
    sampleContextTokens: 1,
    sampleCount: 1,
    task: "预测用户下一条输入",
  };
  database.createSession(sessionId, process.cwd());
  await database.syncHistory(sessionId, [
    new HumanMessage({ content: "请分析这段代码并给出详细设计", id: "first-user" }),
    new AIMessage({ content: "历史回复 <sample>", id: "sample-assistant" }),
    new HumanMessage({ content: "请继续实现", id: "sample-user" }),
    new AIMessage({ content: "当前回复 <current>", id: "current-assistant" }),
  ]);
  const service = new PredictionService(settings);
  return {
    database,
    async dispose() {
      await service.close();
      await server.stop(true);
      database.deleteSession(sessionId);
      database.close();
      rmSync(paths.dir, { force: true, recursive: true });
      delete process.env[apiKeyEnv];
      if (previousHome === undefined) {
        delete process.env["OMITY_HOME"];
      } else {
        process.env["OMITY_HOME"] = previousHome;
      }
      rmSync(home, { force: true, recursive: true });
    },
    home,
    paths,
    replies,
    requests,
    respondWith(response: () => Promise<Response>) {
      respond = response;
    },
    service,
    sessionId,
    settings,
  };
}
export function completion(replies: string[]) {
  return {
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        message: { content: JSON.stringify({ elements: replies }), role: "assistant" },
      },
    ],
    created: 1,
    id: "prediction-completion",
    model: "test",
    object: "chat.completion",
    usage: { completion_tokens: 10, prompt_tokens: 20, total_tokens: 30 },
  };
}
