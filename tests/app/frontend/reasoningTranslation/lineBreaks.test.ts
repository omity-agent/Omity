import { expect, test } from "bun:test";
import { encodeTranslationLineBreaks } from "../../../../src/app/frontend/services/translation/lineBreaks";

test("translation line markers preserve every newline representation", () => {
  const source = "first\n\nsecond\r\nthird\rfour",
    protectedInput = encodeTranslationLineBreaks(source);
  expect(protectedInput.encoded).not.toMatch(/[\r\n]/);
  expect(
    protectedInput.restore(
      protectedInput.encoded
        .replace("first", "第一")
        .replace("second", "第二")
        .replace("third", "第三")
        .replace("four", "第四"),
    ),
  ).toBe("第一\n\n第二\r\n第三\r第四");
});
test("translation line markers avoid source marker collisions", () => {
  const source = "before[[LNBRK_0_0_LF]]\nafter",
    protectedInput = encodeTranslationLineBreaks(source);
  expect(protectedInput.encoded).toContain("[[LNBRK_1_0_LF]]");
  expect(protectedInput.restore(protectedInput.encoded)).toBe(source);
});
test("translation line markers reject missing, duplicated, and reordered markers", () => {
  const protectedInput = encodeTranslationLineBreaks("first\nsecond\r\nthird"),
    [first, second] =
      protectedInput.encoded.match(/\[\[LNBRK_[^\]]+]]/g) ?? [];
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  expect(() => protectedInput.restore("translated")).toThrow("丢失换行标记");
  expect(() => protectedInput.restore(`${first}${first}${second}`)).toThrow("重复换行标记");
  expect(() => protectedInput.restore(`${second}${first}`)).toThrow("丢失换行标记");
});
