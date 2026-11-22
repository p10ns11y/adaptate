import { Sparkline } from "./charts";
import { formatCount, formatHeap, formatMicros, readiness } from "./format";
import { protocolLabel } from "./load-script";
import type { CallSnapshot, LoadSnapshot } from "./session";

export function CompareColumns({ snapshot }: { snapshot: LoadSnapshot }) {
  return (
    <section className="panel" aria-labelledby="compare-heading">
      <div className="section-head">
        <h2 id="compare-heading">Re-parse and incremental</h2>
        <p>
          Both columns run <code>createAgUiPartialValidator</code> on every delta. The page publishes
          with <code>createFrameThrottle</code>. Dropped frames count chunk work past one 16.7 ms frame.
        </p>
      </div>
      {snapshot.latestPreview ? (
        <p className="preview">
          <span className="eyebrow">
            {snapshot.latestProtocol ? protocolLabel(snapshot.latestProtocol) : "Delta"}
          </span>
          <code>{snapshot.latestPreview}</code>
        </p>
      ) : (
        <p className="preview">Waiting for the first delta.</p>
      )}
      <div className="compare">
        <EngineColumn
          heading="@adaptate/core/stream"
          kicker="Re-parse"
          tone="reparse"
          micros={snapshot.reparseMicros}
          dropped={snapshot.reparseDropped}
          series={snapshot.reparse}
          calls={snapshot.calls}
          engine="reparse"
        />
        <EngineColumn
          heading="@adaptate/core/stream-incremental"
          kicker="Incremental"
          tone="incremental"
          micros={snapshot.incrementalMicros}
          dropped={snapshot.incrementalDropped}
          series={snapshot.incremental}
          calls={snapshot.calls}
          engine="incremental"
        />
      </div>
      {snapshot.heapBytes.length > 0 ? (
        <div className="heap">
          <Sparkline
            values={snapshot.heapBytes}
            label="Tab heap"
            unit="MB"
            tone="heap"
            formatValue={(value) => formatHeap(value).replace(" MB", "")}
          />
        </div>
      ) : null}
    </section>
  );
}

function EngineColumn(props: {
  heading: string;
  kicker: string;
  tone: "reparse" | "incremental";
  micros: number;
  dropped: number;
  series: { micros: number[]; droppedFrames: number[] };
  calls: CallSnapshot[];
  engine: "reparse" | "incremental";
}) {
  return (
    <article className={`engine engine-${props.tone}`}>
      <p className="eyebrow">{props.kicker}</p>
      <h3>{props.heading}</h3>
      <p className="stat num">
        <strong>{formatMicros(props.micros)}</strong>
        <span>µs/chunk</span>
      </p>
      <Sparkline
        values={props.series.micros}
        label="µs/chunk"
        unit="µs"
        tone={props.tone}
        formatValue={formatMicros}
      />
      <Sparkline
        values={props.series.droppedFrames}
        label="Dropped frames"
        unit="frames"
        tone={props.tone}
        formatValue={formatCount}
      />
      <p className="drop-total num">{formatCount(props.dropped)} frames dropped</p>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">{props.kicker} tool calls</caption>
          <thead>
            <tr>
              <th scope="col">Call</th>
              <th scope="col">Protocol</th>
              <th scope="col">Title</th>
              <th scope="col">Notes</th>
              <th scope="col">Items</th>
              <th scope="col">Card</th>
            </tr>
          </thead>
          <tbody>
            {props.calls.length === 0 ? (
              <tr>
                <td colSpan={6}>No calls yet.</td>
              </tr>
            ) : (
              props.calls.map((call) => (
                <tr key={call.toolCallId}>
                  <th scope="row">{call.toolCallId}</th>
                  <td>{protocolLabel(call.protocol)}</td>
                  <td>{props.engine === "reparse" ? call.reparseTitle : call.incrementalTitle}</td>
                  <td className="num">
                    {formatCount(props.engine === "reparse" ? call.reparseNotes : call.incrementalNotes)}
                  </td>
                  <td className="num">
                    {formatCount(props.engine === "reparse" ? call.reparseItems : call.incrementalItems)}
                  </td>
                  <td>{readiness(props.engine === "reparse" ? call.reparseValid : call.incrementalValid)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
