import { type ApiController, createApi } from "../../src/app/http/handler";
import { expect, test } from "bun:test";
import { createApiController } from "./support/apiController";

test("fork creation is exposed only through the explicit materialization endpoint", async () => {
  const calls: Parameters<ApiController["materializeFork"]>[] = [],
    controller = createApiController({
      materializeFork: (...args) => {
        calls.push(args);
        return Promise.resolve({
          createdAt: 1,
          error: null,
          id: "materialized",
          status: "idle",
          title: "materialized",
          updatedAt: 1,
          workspace: "F:/workspace",
        });
      },
    }),
    api = createApi(controller),
    request = { body: JSON.stringify({ beforeMessageId: 42 }), method: "POST" },
    legacy = await api.request("/api/sessions/source/fork", request);
  expect(legacy.status).toBe(404);
  expect(calls).toHaveLength(0);
  const response = await api.request("/api/sessions/source/fork/materialize", request);
  expect(response.status).toBe(200);
  expect(calls).toEqual([["source", 42]]);
  expect(await response.json()).toMatchObject({ session: { id: "materialized" } });
});
