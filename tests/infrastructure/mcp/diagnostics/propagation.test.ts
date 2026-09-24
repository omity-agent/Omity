import { expect, test } from "bun:test";
import { connectStdioClient } from "../../../../src/infrastructure/mcp/client/stdio";
import { createMcpLoadError } from "../../../../src/infrastructure/mcp/tools/catalog";
import { encode } from "iconv-lite";
import { errorResponse } from "../../../../src/app/http/errors";

test.each(["gbk", "utf8"] as const)(
  "%s child stderr reaches the browser API error without corruption",
  async (encoding) => {
    const output = "'xxx\\xxx.exe' 不是内部或外部命令，也不是可运行的程序\r\n或批处理文件。",
      bytes = encode(output, encoding),
      connection = connectStdioClient("broken", {
        args: [
          "--eval",
          `process.stderr.write(Buffer.from("${bytes.toString("hex")}", "hex"), () => process.exit(2))`,
        ],
        command: process.execPath,
        stderr: "pipe",
      });
    expect(connection).rejects.toThrow(`子进程 stderr：\n${output}`);
    const response = await connection.catch((error: unknown) =>
      errorResponse(createMcpLoadError(error)),
    );
    expect(response).toMatchObject({
      body: {
        error: {
          message: expect.stringContaining(`子进程 stderr：\n${output}`),
        },
      },
    });
  },
);
