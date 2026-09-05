import { ZodError, type z } from "zod";
import { minBy, uniq } from "es-toolkit";

export function collectReadableZodIssues(error: unknown): string[] {
  if (!(error instanceof ZodError)) {
    return [];
  }
  return uniq(flattenBestIssues(error.issues).map(formatZodIssue));
}
function flattenBestIssues(issues: readonly z.core.$ZodIssue[]): z.core.$ZodIssue[] {
  return issues.flatMap((issue) => {
    if (issue.code !== "invalid_union") {
      return [issue];
    }
    const candidates = issue.errors
        .map((candidate) => flattenBestIssues(candidate))
        .filter((candidate) => candidate.length > 0),
      best = minBy(candidates, (candidate) => candidate.length);
    return best ?? [issue];
  });
}
function formatZodIssue(issue: z.core.$ZodIssue): string {
  const path = formatIssuePath(issue.path);
  if (issue.code === "invalid_type") {
    if (issue.path.at(-1) === "args" && issue.expected === "array") {
      return `${path} 应为字符串数组；如无参数可省略`;
    }
    if (issue.path.at(-1) === "command" && issue.expected === "string") {
      return `${path} 应为可执行命令字符串`;
    }
    if (issue.path.at(-1) === "url" && issue.expected === "string") {
      return `${path} 应为 HTTP/SSE MCP 服务地址`;
    }
  }
  return `${path} ${issue.message}`;
}
function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "settings/toolbox.yaml";
  }
  return `settings/toolbox.yaml.${path.map(String).join(".")}`;
}
