import { reportError } from "../errors";

export function subscribeEvents(
  source: EventTarget & { close: () => void },
  handlers: Record<string, (event: Event) => void>,
) {
  const controller = new AbortController();
  for (const [name, handle] of Object.entries(handlers)) {
    source.addEventListener(
      name,
      (event) => {
        try {
          handle(event);
        } catch (error) {
          reportError(error);
        }
      },
      { signal: controller.signal },
    );
  }
  return () => {
    controller.abort();
    source.close();
  };
}
