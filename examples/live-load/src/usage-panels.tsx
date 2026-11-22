import { OrderCard } from "./usages/react-view";
import { openApiCardReady } from "./usages/openapi";
import { frameSseData } from "./usages/sse";
import { checkTanStackStream } from "./usages/tanstack";
import { usageSnippets } from "./usages/snippets";
import { formatCount, readiness } from "./format";
import { protocolLabel } from "./load-script";
import type { LoadSnapshot } from "./session";

export function UsagePanels({ snapshot }: { snapshot: LoadSnapshot }) {
  let order = snapshot.latestTitle ? { title: snapshot.latestTitle } : {};
  let tanstack = checkTanStackStream({
    partial: snapshot.latestTitle ? { title: snapshot.latestTitle } : null,
    final: null,
  });
  let partialValid = tanstack.partial?.card.valid;
  return (
    <section className="panel" aria-labelledby="usage-heading">
      <div className="section-head">
        <h2 id="usage-heading">Usage</h2>
        <p>Each snippet is the file CI typechecks. The live column is this run.</p>
      </div>
      <div className="usage-list">
        {usageSnippets.map((snippet) => (
          <article key={snippet.id} className="usage" aria-labelledby={`${snippet.id}-heading`}>
            <div className="usage-copy">
              <h3 id={`${snippet.id}-heading`}>{snippet.title}</h3>
              <p className="file-name">{snippet.fileName}</p>
              <pre tabIndex={0} aria-label={`${snippet.title} source`}>
                <code>{snippet.source}</code>
              </pre>
            </div>
            <div className="usage-live">
              <h4>Live</h4>
              <LiveView
                id={snippet.id}
                snapshot={snapshot}
                order={order}
                partialValid={partialValid}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveView(props: {
  id: string;
  snapshot: LoadSnapshot;
  order: { title?: string };
  partialValid: boolean | undefined;
}) {
  if (props.id === "react-view") {
    return (
      <>
        <OrderCard order={props.order} />
        <PayloadStats snapshot={props.snapshot} />
      </>
    );
  }
  if (props.id === "openapi") {
    let ready = openApiCardReady(props.order);
    return (
      <>
        <p>{ready ? "OpenAPI card ready." : "OpenAPI card is waiting for a title."}</p>
        <p>{props.snapshot.latestTitle ? props.snapshot.latestTitle : "No title yet."}</p>
      </>
    );
  }
  if (props.id === "ag-ui") {
    return (
      <>
        <p>
          {props.snapshot.calls.length} parallel tool {props.snapshot.calls.length === 1 ? "call" : "calls"}.
        </p>
        <CallList snapshot={props.snapshot} />
      </>
    );
  }
  if (props.id === "node-stream") {
    return (
      <>
        <p>The browser feeds the same deltas through fromAsyncIterable. The snippet runs stream.pipeline on a Node Readable.</p>
        <PayloadStats snapshot={props.snapshot} />
      </>
    );
  }
  if (props.id === "web-readable") {
    return (
      <>
        <p>{formatCount(props.snapshot.chunks)} byte chunks read on this page.</p>
        <PayloadStats snapshot={props.snapshot} />
      </>
    );
  }
  if (props.id === "sse") {
    return (
      <>
        <p>Latest event, framed the way fetch and EventSource deliver it.</p>
        <pre className="event-frame">
          <code>{props.snapshot.latestDelta ? frameSseData(props.snapshot.latestDelta) : "data:"}</code>
        </pre>
      </>
    );
  }
  if (props.id === "tanstack") {
    let finalLabel =
      props.snapshot.status === "done"
        ? readiness(props.snapshot.tanstackFinalValid)
        : "Waiting";
    return (
      <>
        <p>Partial card: {readiness(props.partialValid)}</p>
        <p>Final card: {finalLabel}</p>
        <p>{props.snapshot.latestTitle ? props.snapshot.latestTitle : "No partial title yet."}</p>
      </>
    );
  }
  return null;
}

function PayloadStats({ snapshot }: { snapshot: LoadSnapshot }) {
  let call = snapshot.calls[snapshot.calls.length - 1];
  if (!call) return <p>No payload yet.</p>;
  return (
    <dl className="stats">
      <div>
        <dt>Protocol</dt>
        <dd>{protocolLabel(call.protocol)}</dd>
      </div>
      <div>
        <dt>Notes</dt>
        <dd className="num">{formatCount(call.incrementalNotes)} characters</dd>
      </div>
      <div>
        <dt>Items</dt>
        <dd className="num">{formatCount(call.incrementalItems)}</dd>
      </div>
    </dl>
  );
}

function CallList({ snapshot }: { snapshot: LoadSnapshot }) {
  if (snapshot.calls.length === 0) return <p>No tool call yet.</p>;
  return (
    <ul className="call-list">
      {snapshot.calls.map((call) => (
        <li key={call.toolCallId}>
          <span>{call.toolCallId}</span>
          <span>{protocolLabel(call.protocol)}</span>
          <span>{readiness(call.incrementalValid)}</span>
        </li>
      ))}
    </ul>
  );
}
