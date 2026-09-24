export const terminalProbes: {
  name: string;
  variables: string[];
  nonEmpty?: boolean;
  version?: string;
  term?: "kitty" | "alacritty";
}[] = [
  { name: "Ghostty", nonEmpty: true, variables: ["GHOSTTY_RESOURCES_DIR"] },
  { name: "WezTerm", variables: ["WEZTERM_VERSION"], version: "WEZTERM_VERSION" },
  { name: "iTerm.app", variables: ["ITERM_SESSION_ID", "ITERM_PROFILE", "ITERM_PROFILE_NAME"] },
  { name: "Apple_Terminal", variables: ["TERM_SESSION_ID"] },
  { name: "kitty", term: "kitty", variables: ["KITTY_WINDOW_ID"] },
  { name: "Alacritty", term: "alacritty", variables: ["ALACRITTY_SOCKET"] },
  { name: "Konsole", variables: ["KONSOLE_VERSION"], version: "KONSOLE_VERSION" },
  { name: "gnome-terminal", variables: ["GNOME_TERMINAL_SCREEN"] },
  { name: "VTE", variables: ["VTE_VERSION"], version: "VTE_VERSION" },
  { name: "WindowsTerminal", variables: ["WT_SESSION"] },
];
