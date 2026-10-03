import "./panda.css";
import { App } from "./App";
import { MarkdownModeProvider } from "./components/Markdown/DisplayMode";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "./services/remoteStore";
import { createRoot } from "react-dom/client";
import { i18nReady } from "./i18n";
import { reportError } from "./services/errors";

await i18nReady;
const root = document.getElementById("root");
if (!root) {
  throw new Error("缺少 root 容器");
}
const queryClient = createQueryClient();
createRoot(root, {
  onCaughtError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
  onRecoverableError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
  onUncaughtError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
}).render(
  <QueryClientProvider client={queryClient}>
    <MarkdownModeProvider>
      <App />
    </MarkdownModeProvider>
  </QueryClientProvider>,
);
