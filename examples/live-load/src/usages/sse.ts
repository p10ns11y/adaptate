export function frameSseData(delta: string): string {
  return `data: ${delta}\n\n`;
}

export async function readSse(response: Response, onDelta: (delta: string) => void): Promise<void> {
  let body = response.body;
  if (!body) return;
  let reader = body.getReader();
  let decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let step = await reader.read();
      if (step.done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(step.value, { stream: true });
      buffer = emitSseBlocks(buffer, onDelta);
    }
    emitSseBlocks(`${buffer}\n\n`, onDelta);
  } finally {
    reader.releaseLock();
  }
}

export function attachEventSource(source: EventSource, onDelta: (delta: string) => void): () => void {
  let onMessage = (event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    if (event.data.length === 0 || event.data === "[DONE]") return;
    onDelta(event.data);
  };
  source.addEventListener("message", onMessage);
  return () => {
    source.removeEventListener("message", onMessage);
  };
}

export async function readSseFromFetch(
  input: RequestInfo | URL,
  onDelta: (delta: string) => void,
): Promise<void> {
  let response = await fetch(input);
  await readSse(response, onDelta);
}

function emitSseBlocks(buffer: string, onDelta: (delta: string) => void): string {
  let separator = buffer.indexOf("\n\n");
  while (separator >= 0) {
    let block = buffer.slice(0, separator);
    buffer = buffer.slice(separator + 2);
    emitSseBlock(block, onDelta);
    separator = buffer.indexOf("\n\n");
  }
  return buffer;
}

function emitSseBlock(block: string, onDelta: (delta: string) => void): void {
  let dataLines: string[] = [];
  for (let line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    let value = line.slice("data:".length);
    dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  if (dataLines.length === 0) return;
  let data = dataLines.join("\n");
  if (data.length === 0 || data === "[DONE]") return;
  onDelta(data);
}
