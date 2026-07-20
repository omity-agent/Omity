import { isAbsolute, resolve } from "node:path";
import untildify from "untildify";

export function resolveConfiguredPath(root: string, path: string) {
  const expanded = untildify(path);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(root, expanded);
}
