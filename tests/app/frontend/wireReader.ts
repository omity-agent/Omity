export async function* readStateWire(response: Response) {
  if (!response.body) {
    throw new Error("State stream has no response body");
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      let end = buffered.indexOf("\n\n");
      while (end < 0) {
        const chunk = await reader.read();
        if (chunk.done) {
          throw new Error("State stream ended before the next event");
        }
        buffered += decoder.decode(chunk.value, { stream: true });
        end = buffered.indexOf("\n\n");
      }
      const fields = Object.fromEntries(
          buffered
            .slice(0, end)
            .split("\n")
            .map((line) => {
              const separator = line.indexOf(":");
              return [line.slice(0, separator), line.slice(separator + 1).trimStart()];
            }),
        ),
        name = fields["event"],
        { data } = fields,
        { id } = fields;
      if (!name || data === undefined || !id) {
        throw new Error("State event is missing its name, data or ID");
      }
      buffered = buffered.slice(end + 2);
      yield new MessageEvent(name, {
        data,
        lastEventId: id,
      });
    }
  } finally {
    await reader.cancel();
  }
}
export async function nextStateEvent(wire: ReturnType<typeof readStateWire>) {
  const next = await wire.next();
  if (next.done) {
    throw new Error("State stream has no next event");
  }
  return next.value;
}
