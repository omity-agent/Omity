import { type AccessService, accessChallengeCookie, accessSessionCookie } from "../access/service";
import { type Context, type Hono } from "hono";
import { authenticationBody, registrationBody, registrationOptionsBody } from "./accessRequest";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jsonBody, limitRequestBody } from "./request";
import type { ClientIdentity } from "../access/network";
import type { HttpBindings } from "@hono/node-server";
import { HttpError } from "./errors";
import { localize } from "../../i18n/server";

export interface AccessEnvironment {
  Bindings: HttpBindings;
  Variables: { client: ClientIdentity };
}
export function mountAccess(app: Hono<AccessEnvironment>, access: AccessService | undefined) {
  app.use("/api/*", async (c, next) => {
    c.header("cache-control", "no-store");
    c.header("x-content-type-options", "nosniff");
    if (!access) {
      c.set("client", { address: "127.0.0.1", local: true });
      await next();
      return;
    }
    const identity = access.identify(c.env.incoming);
    c.set("client", identity);
    if (isStateChanging(c.req.method)) {
      access.requireTrustedOrigin(identity, c.req.header("origin"), new URL(c.req.url).origin);
    }
    if (!isPublicEndpoint(c.req.path)) {
      access.requireAccess(identity, getCookie(c, accessSessionCookie));
    }
    await next();
  });
  return app
    .get("/api/access", (c) =>
      c.json(
        access?.status(c.get("client"), getCookie(c, accessSessionCookie)) ?? {
          authenticated: true,
          configured: false,
          credentialCount: 0,
          local: true,
          publicOrigin: null,
        },
      ),
    )
    .post("/api/access/register/options", jsonBody(registrationOptionsBody), async (c) => {
      const body = c.req.valid("json"),
        result = await required(access).registrationOptions(c.get("client"), body.ticket);
      setChallengeCookie(c, result.challengeId, access);
      return c.json({ options: result.options, origin: result.origin });
    })
    .post("/api/access/register/ticket", limitRequestBody(), (c) =>
      c.json(required(access).registrationTicket(c.get("client"))),
    )
    .post("/api/access/register", jsonBody(registrationBody), async (c) => {
      const result = await required(access).register(challengeCookie(c), c.req.valid("json"));
      setSessionCookie(c, result.token, access);
      clearChallengeCookie(c);
      return c.json({ credentialCount: result.credentialCount, verified: result.verified });
    })
    .post("/api/access/login/options", limitRequestBody(), async (c) => {
      const result = await required(access).authenticationOptions(c.get("client"));
      setChallengeCookie(c, result.challengeId, access);
      return c.json({ options: result.options });
    })
    .post("/api/access/login", jsonBody(authenticationBody), async (c) => {
      const service = required(access),
        token = await service.authenticate(
          c.get("client"),
          challengeCookie(c),
          c.req.valid("json"),
        );
      setSessionCookie(c, token, access);
      clearChallengeCookie(c);
      return c.json({ authenticated: true });
    })
    .post("/api/access/logout", (c) => {
      access?.logout(getCookie(c, accessSessionCookie));
      deleteCookie(c, accessSessionCookie, { path: "/", secure: true });
      return c.json({ authenticated: false });
    });
}
function isPublicEndpoint(path: string) {
  return (
    path === "/api/access" ||
    path.startsWith("/api/access/login") ||
    path.startsWith("/api/access/register")
  );
}
function isStateChanging(method: string) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
function required(access?: AccessService) {
  if (!access) {
    throw new HttpError(500, localize("http:access.serviceUninitialized"));
  }
  return access;
}
function challengeCookie(c: Context) {
  const challenge = getCookie(c, accessChallengeCookie);
  if (!challenge) {
    throw new HttpError(400, localize("http:access.challengeCookieMissing"));
  }
  return challenge;
}
function setChallengeCookie(c: Context, challenge: string, access?: AccessService) {
  setCookie(c, accessChallengeCookie, challenge, {
    httpOnly: true,
    maxAge: Math.floor(required(access).challengeTtlMs / 1000),
    path: "/",
    sameSite: "Strict",
    secure: true,
  });
}
function clearChallengeCookie(c: Context) {
  deleteCookie(c, accessChallengeCookie, { path: "/", secure: true });
}
function setSessionCookie(c: Context, token: string, access?: AccessService) {
  setCookie(c, accessSessionCookie, token, {
    httpOnly: true,
    maxAge: Math.floor(required(access).sessionTtlMs / 1000),
    path: "/",
    sameSite: "Strict",
    secure: true,
  });
}
