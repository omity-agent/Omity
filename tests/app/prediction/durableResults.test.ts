import { afterEach, expect, test } from "bun:test";
import { PredictionService } from "../../../src/app/prediction/service";
import { createPredictionFixture } from "./modelFixture";

const fixtures: Awaited<ReturnType<typeof createPredictionFixture>>[] = [];
afterEach(async () => {
  for (const entry of fixtures.splice(0)) {
    await entry.dispose();
  }
});
async function fixture() {
  const value = await createPredictionFixture();
  fixtures.push(value);
  return value;
}
test("generated predictions survive a new service and a separate process", async () => {
  const { service, sessionId, settings, replies, requests } = await fixture();
  void service.onIdle(sessionId);
  void service.onIdle(sessionId);
  expect(await service.get(sessionId)).toEqual(replies);
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0])).toContain("当前回复 &lt;current&gt;");
  expect(JSON.stringify(requests[0])).toContain("历史回复 &lt;sample&gt;");
  expect(await new PredictionService(settings).get(sessionId)).toEqual(replies);
  const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `import { PredictionService } from "./src/app/prediction/service.ts";
         console.log(JSON.stringify(await new PredictionService(${JSON.stringify(settings)}).get(${JSON.stringify(sessionId)})));`,
      ],
      { cwd: process.cwd(), env: { ...process.env }, stderr: "pipe", stdout: "pipe" },
    ),
    output = await new Response(child.stdout).text(),
    errors = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(errors).toBe("");
  expect(JSON.parse(output)).toEqual(replies);
  expect(requests).toHaveLength(1);
});
test("reading a completed session generates a missing prediction without an idle event", async () => {
  const { service, sessionId, replies, requests } = await fixture();
  expect(await service.get(sessionId)).toEqual(replies);
  expect(requests).toHaveLength(1);
});
test("new input hides persisted predictions and deleting a session removes its record", async () => {
  const { database, service, sessionId, replies } = await fixture();
  void service.onIdle(sessionId);
  expect(await service.get(sessionId)).toEqual(replies);
  database.appendUser(sessionId, "另一个任务");
  expect(await service.get(sessionId)).toEqual([]);
  database.deleteSession(sessionId);
  expect(
    database.db
      .query<{ total: number }, [string]>(
        "SELECT COUNT(*) AS total FROM input_predictions WHERE session_id = ?",
      )
      .get(sessionId)?.total,
  ).toBe(0);
});
test("disabled prediction does not return saved suggestions or call the model", async () => {
  const { service, sessionId, settings, replies, requests } = await fixture();
  void service.onIdle(sessionId);
  expect(await service.get(sessionId)).toEqual(replies);
  expect(
    await new PredictionService({
      ...settings,
      prediction: { ...settings.prediction!, enabled: false },
    }).get(sessionId),
  ).toEqual([]);
  expect(requests).toHaveLength(1);
});
test("insufficient samples do not issue a model request", async () => {
  const { sessionId, settings, requests } = await fixture(),
    service = new PredictionService({
      ...settings,
      prediction: { ...settings.prediction!, sampleCount: 100_000 },
    });
  void service.onIdle(sessionId);
  expect(await service.get(sessionId)).toEqual([]);
  expect(requests).toHaveLength(0);
});
