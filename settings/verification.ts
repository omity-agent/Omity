export const scrollingBrowser = {
  channel: "chrome-canary",
  headless: true,
  ignoreDefaultArgs: ["--hide-scrollbars"],
};
export const regressionViewport = { height: 900, width: 1440 };
export const fixtureServer = { host: "127.0.0.1", port: 0, strictPort: true };
export const fixtureDependencies = {
  entries: ["tests/app/frontend/scrolling/streamingPage.html"],
};
