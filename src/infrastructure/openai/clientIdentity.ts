import { machine, platform, release } from "node:os";
import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { terminalProbes } from "../../../settings/openai/terminalProbes";

function terminalIdentity(environment: NodeJS.ProcessEnv = process.env) {
  const program = environment["TERM_PROGRAM"],
    version = environment["TERM_PROGRAM_VERSION"];
  if (program?.trim() && program.toLowerCase() !== "tmux") {
    return sanitizeTerminal(withVersion(program, version));
  }
  const term = environment["TERM"];
  for (const probe of terminalProbes) {
    if (
      probe.variables.some((key) =>
        probe.nonEmpty ? Boolean(environment[key]?.trim()) : environment[key] !== undefined,
      ) ||
      (probe.term === "kitty" && term?.includes("kitty")) ||
      (probe.term === "alacritty" && term === "alacritty")
    ) {
      return sanitizeTerminal(
        withVersion(probe.name, probe.version ? environment[probe.version] : undefined),
      );
    }
  }
  return sanitizeTerminal(term?.trim() ? term : "unknown");
}
function withVersion(name: string, version?: string) {
  return version?.trim() ? `${name}/${version}` : name;
}
function sanitizeTerminal(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._/-]/gu, "_");
}
export function codexDefaultHeaders() {
  const originator = process.env["CODEX_INTERNAL_ORIGINATOR_OVERRIDE"] ?? codexProtocol.originator,
    os = platform(),
    osName = os === "win32" ? "Windows" : os === "darwin" ? "Mac OS" : os,
    headers = new Headers({
      originator,
      "user-agent": `${originator}/${codexProtocol.version} (${osName} ${release()}; ${machine()}) ${terminalIdentity()}`,
      version: codexProtocol.version,
    });
  for (const [name, variable] of [
    ["OpenAI-Organization", "OPENAI_ORGANIZATION"],
    ["OpenAI-Project", "OPENAI_PROJECT"],
  ] as const) {
    const value = process.env[variable];
    if (value?.trim()) {
      headers.set(name, value);
    }
  }
  return headers;
}
