import { expect, test } from "bun:test";
import { liveApplication } from "./liveApplication";

test("real HTTP access rejects public reads and cross-site writes while registration tickets are single-use", async () => {
  await using app = await liveApplication();
  const remote = { "x-forwarded-for": "203.0.113.9" },
    origin = "https://omity.example.test",
    unauthorized = await fetch(`${app.url}/api/sessions`, { headers: remote });
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  const crossSite = await fetch(`${app.url}/api/sessions/unknown/control`, {
    body: JSON.stringify({ control: "cancel" }),
    headers: { origin: "https://untrusted.invalid" },
    method: "POST",
  });
  expect(crossSite.status).toBe(403);
  const ticket = await fetch(`${app.url}/api/access/register/ticket`, { method: "POST" }),
    body: unknown = await ticket.json();
  expect(ticket.status).toBe(200);
  const request = () =>
      fetch(`${app.url}/api/access/register/options`, {
        body: JSON.stringify(body),
        headers: { ...remote, "content-type": "application/json", origin },
        method: "POST",
      }),
    options = await request();
  expect(options.status).toBe(200);
  expect(options.headers.get("set-cookie")).toContain("HttpOnly");
  expect(options.headers.get("set-cookie")).toContain("Secure");
  expect(await options.json()).toMatchObject({ options: { challenge: expect.any(String) } });
  const replay = await request();
  expect(replay.status).toBe(403);
  expect(app.requests).toEqual([]);
});
