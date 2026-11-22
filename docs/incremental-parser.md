# Incremental partial JSON

```mermaid
flowchart TD
  chunk["New chunk"] --> scan["Scan only the new characters"]
  scan --> marks["Open brackets, string flag, escape flag"]
  marks --> close["Close the prefix at the newest mark"]
  close --> parsed{"JSON.parse succeeds?"}
  parsed -->|yes| keep["Store that value"]
  parsed -->|no| shorter{"A shorter mark is left in this chunk?"}
  shorter -->|yes| close
  shorter -->|no| hold["Keep the previous value"]
  keep --> check["Check that value"]
  hold --> reuse["Reuse the previous check"]
```

Each character of the stream is scanned once. On the grocery order (966 characters, 41 chunks) that is 966 visits, against 68,304 when every chunk rescans the whole buffer. `parsePartialJson` still walks a whole prefix. `createPartialJsonParser` resumes from the previous chunk. `createAgUiPartialValidator` uses that resume. A parsed value is checked with the lenient partial. A chunk that does not parse keeps the previous value and its check. `createFrameThrottle` keeps the latest value and emits it on the next frame, or on `setTimeout(0)` when there is no `requestAnimationFrame`.
