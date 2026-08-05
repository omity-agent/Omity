import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  out: "./src/infrastructure/database/migrations/access",
  schema: "./src/app/access/schema.ts",
});
