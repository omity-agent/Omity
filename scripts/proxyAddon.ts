import { GLIBC, MUSL, familySync } from "detect-libc";
import type { BunPlugin } from "bun";
import { fileURLToPath } from "node:url";

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
      throw new Error("无法识别构建平台的 libc");
    }
    suffix = family === MUSL ? "-musl" : arch === "arm" ? "-gnueabihf" : "-gnu";
  } else if (platform !== "darwin") {
    throw new Error(`系统代理模块不支持此构建平台：${platform}`);
  }
  return fileURLToPath(
    import.meta.resolve(`@vscode/os-proxy-resolver-${platform}-${arch}${suffix}`),
  );
}
