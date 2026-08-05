import { type SQLiteBunDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { accessSessions, challenges, credentials, registrationTickets } from "./schema";
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { closeDatabase, configureDatabase } from "../../infrastructure/database/connection";
import { createHash, randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import type { WebAuthnCredential } from "@simplewebauthn/server";
import { join } from "node:path";
import { migrateAccessDatabase } from "../../infrastructure/database/migrations";

const schema = { accessSessions, challenges, credentials, registrationTickets };
type AccessSchema = typeof schema;
export class AccessStore {
  private readonly db: Database;
  private readonly orm: SQLiteBunDatabase<AccessSchema>;
  constructor(dataDir: string, root = process.cwd()) {
    this.db = new Database(join(dataDir, "access.sqlite"), { create: true, strict: true });
    try {
      configureDatabase(this.db);
      this.orm = drizzle({ client: this.db, schema });
      migrateAccessDatabase(this.orm, root);
    } catch (error) {
      closeDatabase(this.db);
      throw error;
    }
  }
  close() {
    closeDatabase(this.db);
  }
  credentialCount() {
    return this.orm.select({ value: count() }).from(credentials).get()?.value ?? 0;
  }
  credentials(): WebAuthnCredential[] {
    return this.orm
      .select()
      .from(credentials)
      .orderBy(credentials.createdAt)
      .all()
      .map(toCredential);
  }
  credential(id: string): WebAuthnCredential | undefined {
    const row = this.orm.select().from(credentials).where(eq(credentials.id, id)).get();
    return row ? toCredential(row) : undefined;
  }
  addCredential(credential: WebAuthnCredential) {
    this.orm
      .insert(credentials)
      .values({
        counter: credential.counter,
        createdAt: Date.now(),
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        transports: credential.transports,
      })
      .run();
  }
  updateCounter(id: string, counter: number) {
    const updated = this.orm
      .update(credentials)
      .set({ counter: sql`max(${credentials.counter}, ${counter})` })
      .where(eq(credentials.id, id))
      .returning({ id: credentials.id })
      .all();
    if (updated.length === 0) {
      throw new Error(`WebAuthn 凭据不存在：${id}`);
    }
  }
  createChallenge(purpose: "registration" | "authentication", challenge: string, ttlMs: number) {
    this.removeExpired();
    const id = randomToken();
    this.orm
      .insert(challenges)
      .values({ challenge, expiresAt: Date.now() + ttlMs, id, purpose })
      .run();
    return id;
  }
  consumeChallenge(id: string, purpose: "registration" | "authentication") {
    return this.orm.transaction((tx) => {
      const row = tx
        .delete(challenges)
        .where(and(eq(challenges.id, id), eq(challenges.purpose, purpose)))
        .returning({ challenge: challenges.challenge, expiresAt: challenges.expiresAt })
        .get();
      if (!row || row.expiresAt <= Date.now()) {
        throw new Error("WebAuthn 挑战不存在或已过期");
      }
      return row.challenge;
    });
  }
  createSession(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.orm
      .insert(accessSessions)
      .values({ expiresAt: Date.now() + ttlMs, tokenHash: tokenHash(token) })
      .run();
    return token;
  }
  createRegistrationTicket(ttlMs: number) {
    this.removeExpired();
    const token = randomToken();
    this.orm
      .insert(registrationTickets)
      .values({ expiresAt: Date.now() + ttlMs, tokenHash: tokenHash(token) })
      .run();
    return token;
  }
  consumeRegistrationTicket(token: string) {
    return this.orm.transaction((tx) => {
      const hash = tokenHash(token);
      const row = tx
        .delete(registrationTickets)
        .where(eq(registrationTickets.tokenHash, hash))
        .returning({ expiresAt: registrationTickets.expiresAt })
        .get();
      if (!row || row.expiresAt <= Date.now()) {
        throw new Error("WebAuthn 注册链接不存在或已过期");
      }
    });
  }
  hasSession(token?: string) {
    if (!token) {
      return false;
    }
    return Boolean(
      this.orm
        .select({ tokenHash: accessSessions.tokenHash })
        .from(accessSessions)
        .where(
          and(
            eq(accessSessions.tokenHash, tokenHash(token)),
            gt(accessSessions.expiresAt, Date.now()),
          ),
        )
        .get(),
    );
  }
  deleteSession(token?: string) {
    if (token) {
      this.orm
        .delete(accessSessions)
        .where(eq(accessSessions.tokenHash, tokenHash(token)))
        .run();
    }
  }
  private removeExpired() {
    const now = Date.now();
    this.orm.transaction((tx) => {
      tx.delete(challenges).where(lte(challenges.expiresAt, now)).run();
      tx.delete(accessSessions).where(lte(accessSessions.expiresAt, now)).run();
      tx.delete(registrationTickets).where(lte(registrationTickets.expiresAt, now)).run();
    });
  }
}
function toCredential(row: typeof credentials.$inferSelect): WebAuthnCredential {
  return {
    counter: row.counter,
    id: row.id,
    publicKey: new Uint8Array(row.publicKey),
    ...(row.transports ? { transports: row.transports } : {}),
  };
}
function randomToken() {
  return randomBytes(32).toString("base64url");
}
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest();
}
