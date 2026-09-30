import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { createStaticApp } from "../../../src/app/http/static";
import { createTestDirectory } from "../../support/artifacts";
import { getRequestListener } from "@hono/node-server";
import { join } from "node:path";
import { once } from "node:events";
import { requestListenerOptions } from "../../../settings/networking";

test("static asset responses expose their complete body length", async () => {
  const root = createTestDirectory("static-assets"),
    assetPath = join(root, "assets", "config.json"),
    content = '{"ready":true}';
  await Bun.write(assetPath, content);
  const server = createServer(
    getRequestListener(createStaticApp(root).fetch, requestListenerOptions),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("静态资源测试服务器未监听");
  }
  try {
    const response = await fetch(`http://127.0.0.1:${address.port.toString()}/assets/config.json`),
      body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(
      new TextEncoder().encode(content).byteLength.toString(),
    );
    expect(body).toBe(content);
  } finally {
    server.close();
  }
});
