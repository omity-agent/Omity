import { expect, test } from "bun:test";
import { highlightChannel } from "../../../../src/app/frontend/components/HighlightedCode/background/channel";

test("RPC correlates overlapping replies and propagates remote errors", async () => {
  const { port1, port2 } = new MessageChannel(),
    pending = Promise.withResolvers<{ language: string; lines: string[] }>(),
    server = highlightChannel(port1, {
      highlight: () => pending.promise,
      release: () => {
        throw new Error("release failed");
      },
    }),
    client = highlightChannel(port2);
  port1.start();
  port2.start();
  try {
    const result = client.highlight({ code: "source", streamId: "rpc" });
    expect(client.release("rpc")).rejects.toThrow("release failed");
    pending.resolve({ language: "text", lines: ["source"] });
    expect(await result).toEqual({ language: "text", lines: ["source"] });
  } finally {
    client.$close();
    server.$close();
    port1.close();
    port2.close();
  }
});
