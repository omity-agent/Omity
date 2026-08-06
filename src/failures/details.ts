import { serializeError } from "serialize-error";
import { z } from "zod";

export type ErrorValue =
  | null
  | boolean
  | number
  | string
  | ErrorValue[]
  | ErrorDetails
  | { [key: string]: ErrorValue };
export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorDetails;
  details?: Record<string, ErrorValue>;
}
export interface ErrorSummaryItem {
  name: string;
  message: string;
  details?: Record<string, ErrorValue>;
}
export interface ErrorSummary extends ErrorSummaryItem {
  causes?: ErrorSummaryItem[];
}
const errorValueSchema: z.ZodType<ErrorValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(errorValueSchema),
    z.record(z.string(), errorValueSchema),
  ]),
);
const errorDetailsSchema: z.ZodType<ErrorDetails> = z.lazy(() =>
  z.strictObject({
    cause: errorDetailsSchema.optional(),
    details: z.record(z.string(), errorValueSchema).optional(),
    message: z.string(),
    name: z.string(),
    stack: z.string().optional(),
  }),
);
const errorValuesSchema = z.record(z.string(), errorValueSchema);
const hiddenDetailKeys = new Set(["pregelTaskId"]);
const structuralErrorKeys = new Set(["name", "message", "stack", "cause", ...hiddenDetailKeys]);
export function captureError(error: unknown): ErrorDetails {
  const serializedError: unknown = serializeError(error);
  const json = JSON.stringify(serializedError);
  const serialized: unknown = JSON.parse(json);
  if (!(error instanceof Error)) {
    return errorDetailsSchema.parse({
      details: { value: nonErrorValue(error, serialized) },
      message: String(error),
      name: valueName(error),
    });
  }
  return errorDetailsSchema.parse(
    adaptSerializedError(isRecord(serialized) ? serialized : {}, error),
  );
}
export function stringifyError(error: ErrorDetails) {
  return JSON.stringify(error);
}
export function summarizeError(error: ErrorDetails): ErrorSummary {
  const levels: ErrorSummaryItem[] = [];
  const seen = new Set<string>();
  let current: ErrorDetails | undefined = error;
  while (current) {
    const level = summarizeLevel(current);
    const identity = JSON.stringify(level);
    if (!seen.has(identity)) {
      seen.add(identity);
      levels.push(level);
    }
    current = current.cause;
  }
  const [root, ...causes] = levels;
  if (!root) {
    throw new Error("错误摘要缺少根错误");
  }
  return causes.length > 0 ? { ...root, causes } : root;
}
export function errorFingerprint(error: ErrorDetails) {
  return JSON.stringify(summarizeError(error));
}
export function parseError(value: string): ErrorDetails {
  const parsed: unknown = JSON.parse(value);
  const result = errorDetailsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("队列错误详情无效");
  }
  return result.data;
}
function adaptSerializedError(serialized: Record<string, unknown>, source?: unknown): ErrorDetails {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(serialized)) {
    if (!structuralErrorKeys.has(key)) {
      details[key] = sourceProperty(source, key, value);
    }
  }
  const { cause } = serialized;
  const parsedDetails = errorValuesSchema.parse(details);
  return {
    message: typeof serialized["message"] === "string" ? serialized["message"] : String(source),
    name: typeof serialized["name"] === "string" ? serialized["name"] : valueName(source),
    ...(typeof serialized["stack"] === "string" ? { stack: serialized["stack"] } : {}),
    ...(cause === undefined
      ? {}
      : {
          cause: adaptSerializedError(
            isRecord(cause) ? cause : serializeError(cause),
            source instanceof Error ? source.cause : undefined,
          ),
        }),
    ...(Object.keys(parsedDetails).length > 0 ? { details: parsedDetails } : {}),
  };
}
function summarizeLevel(error: ErrorDetails): ErrorSummaryItem {
  const details = visibleDetails(error.details);
  return {
    ...(Object.keys(details).length > 0 ? { details } : {}),
    message: error.message,
    name: error.name,
  };
}
function visibleDetails(details: Record<string, ErrorValue> | undefined) {
  if (!details) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !hiddenDetailKeys.has(key)),
  ) as Record<string, ErrorValue>;
}
function sourceProperty(source: unknown, key: string, serialized: unknown) {
  if (!isRecord(source)) {
    return serialized;
  }
  try {
    const value = source[key];
    return value instanceof Headers ? Object.fromEntries(value.entries()) : serialized;
  } catch {
    return serialized;
  }
}
function nonErrorValue(value: unknown, serialized: unknown): unknown {
  if (value === null || ["string", "boolean"].includes(typeof value)) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "undefined") {
    return "[undefined]";
  }
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  return serialized;
}
function valueName(value: unknown) {
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  const { constructor } = value;
  return typeof constructor === "function" && constructor.name ? constructor.name : "Object";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
