import { expect, test } from "bun:test";
import { encodeTranslationLineBreaks } from "../../../../src/app/frontend/services/translation/lineBreaks";

test("translation line markers normalize every newline representation to LF", () => {
  const source = "first\n\nsecond\r\nthird\rfour",
    protectedInput = encodeTranslationLineBreaks(source);
  expect(protectedInput.encoded).toBe(
    "first {{lnbrk_0}}  {{lnbrk_1}} second {{lnbrk_2}} third {{lnbrk_3}} four",
  );
  expect(
    protectedInput.restore(
      protectedInput.encoded
        .replace("first", "第一")
        .replace("second", "第二")
        .replace("third", "第三")
        .replace("four", "第四"),
    ),
  ).toBe("第一\n\n第二\n第三\n第四");
});
test("translation line markers avoid source marker collisions", () => {
  const source = "before {{lnbrk_0}} \nafter",
    protectedInput = encodeTranslationLineBreaks(source);
  expect(protectedInput.encoded).toContain(" {{lnbrk_1}} ");
  expect(protectedInput.restore(protectedInput.encoded)).toBe(source);
});
test("translation line markers tolerate common machine translation mutations", () => {
  const protectedInput = encodeTranslationLineBreaks("first\nsecond\nthird");
  expect(protectedInput.restore("第一 { LNBRK : 0 } 第二 [[lnbrk-1]] 第三")).toBe(
    "第一\n第二\n第三",
  );
});
test("translation line markers preserve source spaces beside line breaks", () => {
  const protectedInput = encodeTranslationLineBreaks("first \n second");
  expect(protectedInput.restore(protectedInput.encoded)).toBe("first \n second");
});
test("translation line markers reject duplicated and reordered markers", () => {
  const protectedInput = encodeTranslationLineBreaks("first\nsecond\nthird"),
    [first, second] = protectedInput.encoded.match(/\{\{lnbrk_\d+}}/g) ?? [];
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  expect(() => protectedInput.restore(`${first}${first}${second}`)).toThrow("重复换行标记");
  expect(() => protectedInput.restore(`${second}${first}`)).toThrow("顺序错误");
});
