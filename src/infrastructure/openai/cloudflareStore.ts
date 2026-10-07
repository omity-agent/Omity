import { Cookie, CookieJar } from "tough-cookie";
import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { localize } from "../../i18n/server";

function isChatGptCookieUrl(value: string) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (codexProtocol.cookieHosts.some((host) => host === url.hostname) ||
      codexProtocol.cookieHostSuffixes.some((suffix) => url.hostname.endsWith(suffix)))
  );
}
function allowedName(name: string) {
  return (
    codexProtocol.cookieNames.some((allowed) => allowed === name) ||
    name.startsWith(codexProtocol.cookieNamePrefix)
  );
}
export class CloudflareCookieStore {
  private readonly jar = new CookieJar();
  cookies(url: string) {
    return isChatGptCookieUrl(url)
      ? this.jar
          .getCookiesSync(url)
          .filter((cookie) => allowedName(cookie.key))
          .map((cookie) => cookie.cookieString())
          .join("; ")
      : "";
  }
  store(url: string, values: string[]) {
    if (!isChatGptCookieUrl(url)) {
      return;
    }
    for (const value of values) {
      const name = value.split("=", 1)[0]!.trim();
      if (allowedName(name)) {
        const cookie = Cookie.parse(value);
        if (!cookie) {
          console.warn(localize("network:cloudflareCookieInvalid"));
        } else {
          try {
            this.jar.setCookieSync(cookie, url);
          } catch {
            console.warn(localize("network:cloudflareCookieScopeInvalid"));
          }
        }
      }
    }
  }
}
export const sharedCloudflareStore = new CloudflareCookieStore();
