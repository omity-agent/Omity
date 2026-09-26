import { expect, test } from "bun:test";
import { AppController } from "../../../src/app/controller";
import { appendFileSync } from "node:fs";
import { createApi } from "../../../src/app/http/handler";
import { createPredictionFixture } from "./modelFixture";
import { join } from "node:path";
import { stringify } from "yaml";
import { writeTestConfiguration } from "../../support/configuration";

test("the HTTP endpoint generates predictions and serves them after controller restart", async () => {
  const fixture = await createPredictionFixture();
  try {
    const settingsDirectory = writeTestConfiguration(fixture.home);
    appendFileSync(
      join(settingsDirectory, "main.yaml"),
      stringify({ prediction: fixture.settings.prediction }),
    );
    for (let launch = 0; launch < 2; launch += 1) {
      const controller = new AppController(fixture.home);
      try {
        const api = createApi(controller),
          response = await api.request(`/api/sessions/${fixture.sessionId}/predictions`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ predictions: fixture.replies });
        const missing = await api.request("/api/sessions/missing-session/predictions");
        expect(missing.status).toBe(404);
      } finally {
        await controller.close();
      }
    }
    expect(fixture.requests).toHaveLength(1);
  } finally {
    await fixture.dispose();
  }
});
