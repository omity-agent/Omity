// OpenAI Codex main identifier and request headers.
export const codexProtocol = {
  cookieHostSuffixes: [".chatgpt.com", ".chatgpt-staging.com"],
  cookieHosts: ["chatgpt.com", "chat.openai.com", "chatgpt-staging.com"],
  cookieNamePrefix: "cf_chl_",
  cookieNames: [
    "__cf_bm",
    "__cflb",
    "__cfruid",
    "__cfseq",
    "__cfwaitingroom",
    "__oailb",
    "_cfuvid",
    "cf_clearance",
    "cf_ob_info",
    "cf_use_ob",
  ],
  npmLatestUrl: "https://registry.npmjs.org/@openai%2fcodex/latest",
  originator: "codex_cli_rs",
  websocketBeta: "responses_websockets=2026-02-06",
} as const;
