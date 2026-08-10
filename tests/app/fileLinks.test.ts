import { describe, expect, test } from "bun:test";
import { outputUnit, splitTextUnits } from "../../src/fileLinks/units";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";
import { createTestDirectory } from "../support/artifacts";
import { fileLinkLauncher } from "../../src/app/fileLinks/launch";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { normalizeCodeMatches } from "../../src/app/frontend/components/FileLink/lineBreaks";
import { probeFileLinks } from "../../src/fileLinks/probe";

describe("文件链接探测", () => {
  test("解析工作目录中的真实相对路径并保留文本位置", async () => {
    const workspace = createTestDirectory("file-links"),
      directory = join(workspace, "nested"),
      path = join(directory, "linked.txt");
    await mkdir(directory);
    await Bun.write(path, "linked");
    const text = "查看 ./nested/linked.txt:12",
      matches = await probeFileLinks(text, workspace);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: "file", path });
    const position = matches[0]?.position;
    expect(position && text.slice(position.start, position.end)).toBe("./nested/linked.txt");
  });
  test("流式文本只探测完整行，完成后补上末行", () => {
    expect(splitTextUnits("first\nsecond", 0, 0, false)).toEqual([
      { end: 5, nextOffset: 6, start: 0, text: "first", unitIndex: 0 },
    ]);
    expect(splitTextUnits("first\nsecond", 0, 0, true)).toEqual([
      { end: 5, nextOffset: 6, start: 0, text: "first", unitIndex: 0 },
      { end: 12, nextOffset: 12, start: 6, text: "second", unitIndex: 1 },
    ]);
  });
  test("每个工具输出形成一个探测单元", () => {
    expect(outputUnit("first\nsecond")).toEqual({
      end: 12,
      nextOffset: 12,
      start: 0,
      text: "first\nsecond",
      unitIndex: 0,
    });
    expect(outputUnit("").text).toBe("");
  });
  test("CRLF 高亮文本与路径位置使用同一套偏移", () => {
    const code = "first\r\n./file.txt\r\nlast",
      start = code.indexOf("./file.txt"),
      normalized = normalizeCodeMatches(code, [
        {
          kind: "file",
          path: "F:/work/file.txt",
          position: { end: start + "./file.txt".length, start },
        },
      ]);
    expect(normalized.code).toBe("first\n./file.txt\nlast");
    expect(normalized.matches[0]?.position).toEqual({ end: 16, start: 6 });
  });
});
describe("文件链接动作", () => {
  test("为系统打开与定位动作构造无 Shell 命令", () => {
    expect(fileLinkLauncher(String.raw`C:\work\file.txt`, "open", "win32")).toEqual({
      args: ["url.dll,FileProtocolHandler", String.raw`C:\work\file.txt`],
      command: "rundll32.exe",
    });
    expect(fileLinkLauncher(String.raw`C:\work\file.txt`, "reveal", "win32")).toEqual({
      args: [String.raw`/select,C:\work\file.txt`],
      command: "explorer.exe",
    });
    expect(fileLinkLauncher("/work/file.txt", "reveal", "darwin")).toEqual({
      args: ["-R", "/work/file.txt"],
      command: "open",
    });
    expect(fileLinkLauncher("/work/file.txt", "reveal", "linux")).toEqual({
      args: ["/work"],
      command: "xdg-open",
    });
  });
  test("HTTP 接口校验激活动作并绑定 Session", async () => {
    const actionCalls: Parameters<ReturnType<typeof createApiController>["activateFileLink"]>[] =
        [],
      controller = createApiController({
        activateFileLink: (...args) => {
          actionCalls.push(args);
          return Promise.resolve({ path: args[1] });
        },
      }),
      api = createApi(controller),
      action = await api.request(
        "/api/sessions/session/file-links/activate",
        jsonRequest({ action: "reveal", path: "F:/work/file.txt" }),
      );
    expect(action.status).toBe(200);
    expect(actionCalls).toEqual([["session", "F:/work/file.txt", "reveal"]]);
    const invalid = await api.request(
      "/api/sessions/session/file-links/activate",
      jsonRequest({ action: "browse", path: "F:/work/file.txt" }),
    );
    expect(invalid.status).toBe(400);
  });
});
function jsonRequest(body: unknown): RequestInit {
  return { body: JSON.stringify(body), method: "POST" };
}
