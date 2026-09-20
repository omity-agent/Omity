import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { Logger } from "../../src/infrastructure/logging/logger";

const stdout = spyOn(process.stdout, "write").mockReturnValue(true),
  stderr = spyOn(process.stderr, "write").mockReturnValue(true);
afterEach(() => {
  stdout.mockClear();
  stderr.mockClear();
});
afterAll(() => {
  stdout.mockRestore();
  stderr.mockRestore();
});
test("静默日志不会格式化数据或输出 token", () => {
  const logger = new Logger("debug", true),
    data = {
      toJSON() {
        throw new Error("静默日志不应访问数据");
      },
    };
  logger.debug("debug", data);
  logger.info("info", data);
  logger.warn("warn", data);
  logger.error("error", data);
  logger.child("scope")();
  logger.token("token");
  expect(stdout).not.toHaveBeenCalled();
  expect(stderr).not.toHaveBeenCalled();
});
test("重复日志不节流，逐字输出不添加前缀", () => {
  const logger = new Logger("info");
  for (let index = 0; index < 10; index += 1) {
    logger.info("重复日志");
  }
  expect(stdout).toHaveBeenCalledTimes(10);
  logger.token("原始片段");
  expect(stdout.mock.calls[10]?.[0]).toBe("原始片段");
});
test("日志分组结束函数只执行一次并恢复缩进", () => {
  const logger = new Logger("info"),
    end = logger.child("scope");
  logger.info("inside");
  end();
  end();
  logger.info("outside");
  expect(stdout).toHaveBeenCalledTimes(4);
  expect(stdout.mock.calls[1]?.[0]).toContain("  inside");
  expect(stdout.mock.calls[3]?.[0]).toContain("[info] outside");
});
