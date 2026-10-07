import { join, normalize, relative, resolve } from "node:path";
import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { localize } from "../../i18n/server";

export function createStaticApp(root: string) {
  const app = new Hono<{ Bindings: HttpBindings }>(),
    staticRoot = resolve(root);
  app.use("*", async (c, next) => {
    c.header("content-security-policy", contentSecurityPolicy);
    c.header("cross-origin-opener-policy", "same-origin");
    c.header("referrer-policy", "no-referrer");
    c.header("x-content-type-options", "nosniff");
    await next();
  });
  app.get("/assets/*", async (c) => {
    const file = Bun.file(resolveStaticAsset(staticRoot, c.req.path));
    return (await file.exists()) ? fileResponse(file) : c.notFound();
  });
  app.get("/", () => fileResponse(Bun.file(join(staticRoot, "index.html"))));
  return app;
}
async function fileResponse(file: Bun.BunFile) {
  return new Response(file, {
    headers: {
      "content-length": file.size.toString(),
      "content-type": file.type || "application/octet-stream",
    },
  });
}
function resolveStaticAsset(root: string, requestPath: string) {
  const path = normalize(decodeURIComponent(requestPath).replace(/^\/+/u, "")),
    resolved = resolve(root, path);
  if (relative(root, resolved).startsWith("..")) {
    throw new Error(localize("http:static.pathTraversal", { value0: requestPath }));
  }
  return resolved;
}
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https: http:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");
