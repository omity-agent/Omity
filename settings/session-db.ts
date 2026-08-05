import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./src/infrastructure/database/migrations/session",
  schema: "./src/infrastructure/database/schema/index.ts",
});
