import { useRef, useState, type KeyboardEvent } from "react";

import { usageSnippets } from "../usages/snippets";

export function ExampleTabs() {
  let [selected, setSelected] = useState(0);
  let tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusTab(index: number) {
    let next = (index + usageSnippets.length) % usageSnippets.length;
    setSelected(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") focusTab(selected + 1);
    else if (event.key === "ArrowLeft") focusTab(selected - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(usageSnippets.length - 1);
    else return;
    event.preventDefault();
  }

  let current = usageSnippets[selected];
  return (
    <>
      <div role="tablist" aria-label="Example files" onKeyDown={onKeyDown}>
        {usageSnippets.map((snippet, index) => (
          <button
            key={snippet.id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${snippet.id}`}
            aria-selected={index === selected}
            aria-controls={`panel-${snippet.id}`}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {snippet.title}
          </button>
        ))}
      </div>
      {current && (
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
          <pre tabIndex={0} aria-label={current.fileName}>
            <code>{current.source}</code>
          </pre>
        </div>
      )}
    </>
  );
}
