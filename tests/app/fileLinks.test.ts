import { type ApiController, createApi } from "../../src/app/http/handler";
import { describe, expect, test } from "bun:test";
import { createApiController } from "./support/apiController";
import { createTestDirectory } from "../support/artifacts";
import { fileLinkLauncher } from "../../src/app/fileLinks/launch";
import { fileLinkProbeUnits } from "../../src/app/frontend/components/FileLink/probeUnits";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { probeFileLinks } from "../../src/app/fileLinks/probe";

describe("文件链接探测", () => {
  test("解析工作目录中的真实相对路径并保留文本位置", async () => {
    const workspace = createTestDirectory("file-links");
    const directory = join(workspace, "nested");
    const path = join(directory, "linked.txt");
    await mkdir(directory);
    await Bun.write(path, "linked");
    const text = "查看 ./nested/linked.txt:12";
    const matches = await probeFileLinks(text, workspace);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: "file", path });
    const position = matches[0]?.position;
    expect(position && text.slice(position.start, position.end)).toBe("./nested/linked.txt");
  });
  test("流式文本只探测完整行，完成后补上末行", () => {
    const streaming = fileLinkProbeUnits("first\nsecond", "lines", false);
    expect(streaming).toEqual([{ end: 5, key: "line-0", start: 0, text: "first" }]);
    expect(fileLinkProbeUnits("first\nsecond", "lines", true)).toEqual([
      { end: 5, key: "line-0", start: 0, text: "first" },
      { end: 12, key: "line-1", start: 6, text: "second" },
    ]);
  });
  test("每个工具输出形成一个探测单元", () => {
    expect(fileLinkProbeUnits("first\nsecond", "output", true)).toEqual([
      { end: 12, key: "output", start: 0, text: "first\nsecond" },
    ]);
    expect(fileLinkProbeUnits("", "output", true)).toEqual([
      { end: 0, key: "output", start: 0, text: "" },
    ]);
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
  test("HTTP 接口校验参数并绑定 Session", async () => {
    const probeCalls: Parameters<ApiController["fileLinks"]>[] = [];
    const actionCalls: Parameters<ApiController["activateFileLink"]>[] = [];
    const controller = createApiController({
      activateFileLink: (...args) => {
        actionCalls.push(args);
        return Promise.resolve({ path: args[1] });
      },
      fileLinks: (...args) => {
        probeCalls.push(args);
        return Promise.resolve([]);
      },
    });
    const api = createApi(controller);
    const probe = await api.request(
      "/api/sessions/session/file-links/probe",
      jsonRequest({ text: "./file.txt" }),
    );
    expect(probe.status).toBe(200);
    expect(probeCalls).toEqual([["session", "./file.txt"]]);
    const action = await api.request(
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
