import { resolve as resolvePath } from "node:path";

import { type Browser, chromium, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import {
  fixtureDependencies,
  fixtureServer,
  regressionViewport,
  scrollingBrowser,
} from "../../../../settings/verification";
import viteConfig from "../../../../vite.config";

export class BrowserSession {
  private browser?: Browser;
  private server?: ViteDevServer;
  private origin?: string;
  async start() {
    this.server = await createServer({
      ...viteConfig,
      cacheDir: resolvePath("node_modules/.cache/scrolling-vite"),
      configFile: false,
      logLevel: "error",
      optimizeDeps: fixtureDependencies,
      root: resolvePath(import.meta.dir, "../../../.."),
      server: fixtureServer,
    });
    await this.server.listen();
    const address = this.server.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Scrolling fixture server has no TCP address");
    }
    this.origin = `http://${fixtureServer.host}:${address.port.toString()}`;
    this.browser = await chromium.launch(scrollingBrowser);
  }
  async open(mode: string) {
    const page = await this.openFixture(
      `/tests/app/frontend/scrolling/streamingPage.html?mode=${mode}`,
    );
    await page.waitForFunction(
      () => Object.hasOwn(globalThis, "scrolling") && document.querySelectorAll("pre").length === 3,
    );
    await settleLayout(page);
    return page;
  }
  async openFixture(path: string, setup?: (page: Page) => Promise<void>) {
    if (!this.browser || !this.origin) {
      throw new Error("Browser fixture session has not started");
    }
    const page = await this.browser.newPage({ locale: "zh-CN", viewport: regressionViewport });
    await setup?.(page);
    await page.goto(`${this.origin}${path}`, { waitUntil: "networkidle" });
    return page;
  }
  async stop() {
    await this.browser?.close();
    await this.server?.close();
  }
}
export async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    let remaining = 4;
    const frame = () => {
      remaining -= 1;
      if (remaining === 0) {
        resolve();
      } else {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
    await promise;
  });
}
export async function readScrollPositions(page: Page) {
  return page.locator("#root > section, pre").evaluateAll((elements) =>
    elements.map((element) => ({
      gap: element.scrollHeight - element.clientHeight - element.scrollTop,
      tag: element.tagName,
      top: element.scrollTop,
    })),
  );
}
