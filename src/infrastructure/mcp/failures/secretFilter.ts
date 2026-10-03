import { captureError, errorDetailsSchema } from "../../../failures/details";
import type { McpConnection } from "./wireFormat";
import { sensitiveMcpKey } from "../../../../settings/diagnosticPolicy";

export function createSecretFilter(connection?: McpConnection) {
  const secrets = new Set<string>();
  function remember(value: string) {
    if (value) {
      secrets.add(value);
      secrets.add(encodeURIComponent(value));
    }
  }
  if (connection?.kind === "stdio") {
    for (const [key, value] of Object.entries(connection.options.env ?? {})) {
      if (sensitiveMcpKey.test(key)) {
        remember(value);
      }
    }
    const { args } = connection.options;
    for (const [index, argument] of args.entries()) {
      const separator = argument.search(/[=:]/u),
        key = separator < 0 ? argument : argument.slice(0, separator);
      if (
        (separator >= 0 || argument.startsWith("-")) &&
        /^(?:--?|\/)?[\w-]+$/u.test(key) &&
        sensitiveMcpKey.test(key)
      ) {
        remember(separator < 0 ? (args[index + 1] ?? "") : argument.slice(separator + 1));
      }
    }
  }
  if (connection?.kind === "http") {
    const url = new URL(connection.options.url);
    remember(url.username);
    remember(url.password);
    for (const [key, value] of url.searchParams) {
      if (sensitiveMcpKey.test(key)) {
        remember(value);
      }
    }
    for (const [key, value] of Object.entries(connection.options.headers ?? {})) {
      if (sensitiveMcpKey.test(key)) {
        remember(value);
        remember(value.replace(/^(?:Bearer|Basic)\s+/iu, ""));
      }
    }
  }
  const orderedSecrets = [...secrets].toSorted((left, right) => right.length - left.length);
  function text(value: string) {
    for (const secret of orderedSecrets) {
      value = value.replaceAll(secret, "[REDACTED]");
    }
    return value;
  }
  return {
    error(error: unknown) {
      const serialized = JSON.stringify(captureError(error), (_key, value: unknown) =>
        typeof value === "string" ? text(value) : value,
      );
      return errorDetailsSchema.parse(JSON.parse(serialized));
    },
    text,
  };
}
