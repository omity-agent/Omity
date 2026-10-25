import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { jsonContentType, requestBodyLimit } from "../../../settings/networking";
import { localize } from "../../i18n/server";
import { safeId } from "../../infrastructure/configuration/sessionPaths";
import { HttpError } from "./errors";

export function limitRequestBody(
  maxSize = requestBodyLimit,
  label = localize("http:request.bodyLabel"),
) {
  return bodyLimit({
    maxSize,
    onError() {
      throw new HttpError(
        413,
        localize("http:request.bodyTooLarge", {
          value0: label,
          value1: maxSize.toString(),
        }),
      );
    },
  });
}
const regularBodyLimit = limitRequestBody();
export function validate<Target extends "json" | "form" | "query", Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result, c) => {
    if (target === "json" && !jsonContentType.test(c.req.header("content-type") ?? "")) {
      throw new HttpError(400, localize("http:request.invalidBody"));
    }
    if (!result.success) {
      throw new HttpError(
        400,
        localize("http:request.invalidParameters", { value0: z.prettifyError(result.error) }),
      );
    }
  });
}
export function jsonBody<Schema extends z.ZodType>(schema: Schema) {
  return [regularBodyLimit, validate("json", schema)] as const;
}
export function decodeSessionId(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, localize("http:request.sessionIdInvalid"));
  }
  try {
    return safeId(decoded);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
}
