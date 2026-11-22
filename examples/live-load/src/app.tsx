import { useEffect, useState } from "react";
import { createFrameThrottle } from "@adaptate/core/stream";

import { CompareColumns } from "./compare-columns";
import { formatCount, formatElapsed } from "./format";
import { defaultRunMs, isChunkMessage, isDoneMessage } from "./load-script";
import { createLoadSession, initialSnapshot, type LoadSnapshot, type RunStatus } from "./session";
import { UsagePanels } from "./usage-panels";

export function App() {
  let [snapshot, setSnapshot] = useState<LoadSnapshot>(initialSnapshot);
  let [elapsedMs, setElapsedMs] = useState(0);
  let status = snapshot.status;

  useEffect(() => {
    let startedAt = performance.now();
    let frameId = 0;
    let stopped = false;
    let tick = () => {
      if (stopped) return;
      let next = Math.min(defaultRunMs, performance.now() - startedAt);
      setElapsedMs((current) => (Math.floor(current / 100) === Math.floor(next / 100) ? current : next));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let session = createLoadSession();
    let publish = createFrameThrottle((next: LoadSnapshot) => {
      setSnapshot(next);
    });
    let worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (isDoneMessage(event.data)) {
        publish(session.finish());
        return;
      }
      if (!isChunkMessage(event.data)) return;
      publish(session.absorb(event.data));
    };
    worker.onerror = () => {
      publish(session.stop());
    };
    return () => {
      worker.terminate();
    };
  }, []);

  let shownElapsed = status === "done" ? defaultRunMs : elapsedMs;
  let statusText = statusTextFor(status);

  return (
    <>
      <a className="skip" href="#compare-heading">
        Skip to the comparison
      </a>
      <header className="mast">
        <div className="wrap mast-row">
          <div>
            <p className="eyebrow">Adaptate</p>
            <h1>Streaming load</h1>
            <p className="lede" id="replay-hint">
              A seeded worker sends AG-UI, OpenAI, and Anthropic deltas for 60 seconds. Refresh the page
              to replay this run.
            </p>
          </div>
          <div className="run-box">
            <p role="status">{statusText}</p>
            <p className="elapsed num" aria-hidden="true">
              {formatElapsed(shownElapsed)} / 60.0 s
            </p>
            <progress
              aria-label="Elapsed time"
              max={defaultRunMs}
              value={shownElapsed}
              aria-valuemin={0}
              aria-valuemax={defaultRunMs}
              aria-valuenow={Math.round(shownElapsed)}
              aria-valuetext={`${formatElapsed(shownElapsed)} of 60 seconds, ${statusText}`}
              aria-describedby="replay-hint"
            />
            <p className="chunk-count num">{formatCount(snapshot.chunks)} chunks</p>
            <button type="button" onClick={() => window.location.reload()}>
              Replay
            </button>
          </div>
        </div>
      </header>
      <main className="wrap" aria-busy={status === "running"}>
        <CompareColumns snapshot={snapshot} />
        <UsagePanels snapshot={snapshot} />
      </main>
    </>
  );
}

function statusTextFor(status: RunStatus): string {
  if (status === "done") return "Done. Refresh the page to replay this run.";
  if (status === "stopped") return "The simulator stopped. Refresh the page to replay this run.";
  return "Running";
}
