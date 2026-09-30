export const modelToolPolicy = {
  allowedTypes: {
    completions: ["function"],
    messages: ["custom", "tool_search_tool_regex_20251119", "tool_search_tool_bm25_20251119"],
    responses: ["function", "custom", "tool_search"],
  },
  blockedOptions: ["web_search_options", "mcp_servers", "container"],
} as const;
