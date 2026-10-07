import { GLIBC, MUSL, familySync } from "detect-libc";
import type { BunPlugin } from "bun";
import { fileURLToPath } from "node:url";
import { localize } from "../src/i18n/server";

export const proxyAddon: BunPlugin = {
  name: "system-proxy-native-addon",
  setup(build) {
    build.onLoad({ filter: /[/\\]@vscode[/\\]os-proxy-resolver[/\\]index\.js$/u }, () => ({
      contents: `import binding from ${JSON.stringify(nativeBinding())};
export const { ProxyResolver, resolveProxy, readProxyConfig } = binding;`,
      loader: "js",
    }));
  },
};
function nativeBinding() {
  const { arch, platform } = process;
  let suffix = "";
  if (platform === "win32") {
    suffix = "-msvc";
  } else if (platform === "linux") {
    const family = familySync();
    if (family !== GLIBC && family !== MUSL) {
      throw new Error(localize("build:unknownLibc"));
    }
    suffix = family === MUSL ? "-musl" : arch === "arm" ? "-gnueabihf" : "-gnu";
  } else if (platform !== "darwin") {
    throw new Error(localize("build:unsupportedPlatform", { platform }));
  }
  return fileURLToPath(
    import.meta.resolve(`@vscode/os-proxy-resolver-${platform}-${arch}${suffix}`),
  );
}
