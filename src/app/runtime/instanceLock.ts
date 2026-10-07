import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isProcessRunning } from "../../infrastructure/process/ownership";
import { localize } from "../../i18n/server";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

const ownerSchema = z.object({
  pid: z.number().int().positive(),
  token: z.uuid(),
});
export type AppInstanceOwner = z.infer<typeof ownerSchema>;
export class AppInstanceLock {
  private released = false;
  private constructor(
    private readonly path: string,
    readonly owner: AppInstanceOwner,
    readonly abandonedOwner?: AppInstanceOwner,
  ) {}
  static acquire(directory: string) {
    mkdirSync(directory, { recursive: true });
    const path = resolve(directory, "app.lock");
    let abandonedOwner: AppInstanceOwner | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const owner = { pid: process.pid, token: randomUUID() };
      try {
        const descriptor = openSync(path, "wx");
        try {
          writeFileSync(descriptor, JSON.stringify(owner), "utf8");
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(path);
          throw error;
        }
        closeSync(descriptor);
        return new AppInstanceLock(path, owner, abandonedOwner);
      } catch (error) {
        if (!isExistsError(error)) {
          throw error;
        }
        const existingOwner = readOwner(path);
        if (isProcessRunning(existingOwner.pid)) {
          throw new Error(
            localize("application:runtime.instanceAlreadyRunning", {
              value0: existingOwner.pid.toString(),
              value1: directory,
            }),
            {
              cause: error,
            },
          );
        }
        abandonedOwner = existingOwner;
        unlinkSync(path);
      }
    }
    throw new Error(localize("application:runtime.lockAcquireFailed", { value0: path }));
  }
  release() {
    if (this.released) {
      return;
    }
    const owner = readOwner(this.path);
    if (owner.token !== this.owner.token) {
      throw new Error(localize("application:runtime.lockOwnerChanged", { value0: this.path }));
    }
    unlinkSync(this.path);
    this.released = true;
  }
}
function readOwner(path: string) {
  if (!existsSync(path)) {
    throw new Error(localize("application:runtime.lockMissing", { value0: path }));
  }
  const value: unknown = JSON.parse(readFileSync(path, "utf8")),
    parsed = ownerSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(localize("application:runtime.lockInvalid", { value0: path }));
  }
  return parsed.data;
}
function isExistsError(error: unknown) {
  return isErrorCode(error, "EEXIST");
}
function isErrorCode(error: unknown, code: string) {
  return (
    error instanceof Error && "code" in error && (error as Error & { code?: unknown }).code === code
  );
}
