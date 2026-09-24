import { expect, test } from "bun:test";
import { StderrCapture } from "../../../../src/infrastructure/mcp/client/diagnostics";
import { encode } from "iconv-lite";

const commandError = "'xxx\\xxx.exe' 不是内部或外部命令，也不是可运行的程序\r\n或批处理文件。",
  gbkCommandError = Buffer.from(
    "277878785c7878782e6578652720b2bbcac7c4dab2bfbbf2cde2b2bfc3fcc1eea3acd2b2b2bbcac7bfc9d4cbd0d0b5c4b3ccd0f20d0abbf2c5fab4a6c0edcec4bcfea1a30d0a",
    "hex",
  );
test("Windows GBK command errors retain Chinese diagnostics", () => {
  const capture = new StderrCapture(64 * 1024);
  capture.append(gbkCommandError);
  expect(capture.text()).toBe(commandError);
});
test.each(["utf8", "gbk", "gb18030"] as const)(
  "%s diagnostics are decoded after reassembling split characters",
  (encoding) => {
    const capture = new StderrCapture(64 * 1024),
      bytes = encode(`${commandError}\r\n`, encoding);
    for (const byte of bytes) {
      capture.append(Uint8Array.of(byte));
    }
    expect(capture.text()).toBe(commandError);
  },
);
test("UTF-8 diagnostics retain emoji and multilingual text", () => {
  const capture = new StderrCapture(64 * 1024),
    output = "初始化失败 🚫 — café — 日本語";
  capture.append(Buffer.from(output));
  expect(capture.text()).toBe(output);
});
test("bounded diagnostics retain the latest encoded error", () => {
  const capture = new StderrCapture(128);
  capture.append(Buffer.alloc(1024, 0x78));
  capture.append(gbkCommandError);
  expect(capture.text()).toStartWith("[前部输出已截断]\n");
  expect(capture.text()).toEndWith(commandError);
  expect(capture.text()).not.toContain("\uFFFD");
});
test("truncating inside a UTF-8 character does not change encoding detection", () => {
  const capture = new StderrCapture(64),
    output = "这是子进程的中文错误信息，不能运行。".repeat(100);
  capture.append(Buffer.from(output));
  expect(capture.text()).toBe(`[前部输出已截断]\n${output.slice(-21)}`);
});
test("empty and whitespace-only diagnostics remain empty", () => {
  const capture = new StderrCapture(128);
  expect(capture.text()).toBe("");
  capture.append(Buffer.from(" \r\n\t"));
  expect(capture.text()).toBe("");
});
