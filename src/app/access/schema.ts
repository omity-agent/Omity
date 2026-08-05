import { blob, check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { sql } from "drizzle-orm";

export const credentials = sqliteTable("credentials", {
  counter: integer().notNull(),
  createdAt: integer("created_at").notNull(),
  id: text().primaryKey(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  transports: text("transports_json", { mode: "json" }).$type<AuthenticatorTransportFuture[]>(),
});
export const challenges = sqliteTable(
  "challenges",
  {
    challenge: text().notNull(),
    expiresAt: integer("expires_at").notNull(),
    id: text().primaryKey(),
    purpose: text({ enum: ["registration", "authentication"] }).notNull(),
  },
  (table) => [
    check("challenges_purpose", sql`${table.purpose} in ('registration', 'authentication')`),
  ],
);
export const accessSessions = sqliteTable("access_sessions", {
  expiresAt: integer("expires_at").notNull(),
  tokenHash: blob("token_hash", { mode: "buffer" }).primaryKey(),
});
export const registrationTickets = sqliteTable("registration_tickets", {
  expiresAt: integer("expires_at").notNull(),
  tokenHash: blob("token_hash", { mode: "buffer" }).primaryKey(),
});
