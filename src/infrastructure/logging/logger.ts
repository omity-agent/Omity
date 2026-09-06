import { type ConsolaInstance, LogLevels, createConsola } from "consola/basic";
import type { LogLevel } from "../../types";
import { once } from "es-toolkit";
import { serializeError } from "serialize-error";

export class Logger {
  private indent = 0;
  private readonly output: ConsolaInstance;
  constructor(
    level: LogLevel,
    private readonly silent = false,
  ) {
    this.output = createConsola({
      level: LogLevels[silent ? "silent" : level],
      throttle: 0,
    });
  }
  child(title: string) {
    this.info(`┌─ ${title}`);
    this.indent += 1;
    return once(() => {
      this.indent -= 1;
      this.info(`└─ ${title}`);
    });
  }
  debug(message: string, data?: unknown) {
    this.write("debug", message, data);
  }
  info(message: string, data?: unknown) {
    this.write("info", message, data);
  }
  warn(message: string, data?: unknown) {
    this.write("warn", message, data);
  }
  error(message: string, data?: unknown) {
    this.write("error", message, data);
  }
  token(text: string) {
    if (this.silent) {
      return;
    }
    process.stdout.write(text);
  }
  private write(level: LogLevel, message: string, data?: unknown) {
    if (LogLevels[level] > this.output.level) {
      return;
    }
    this.output[level]({
      args: data === undefined ? [] : [data instanceof Error ? serializeError(data) : data],
      message: `${"  ".repeat(this.indent)}${message}`,
    });
  }
}
