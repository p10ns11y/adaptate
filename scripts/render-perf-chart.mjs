import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const assetDirectory = resolve(scriptDirectory, "../assets");
const measurement = JSON.parse(
  readFileSync(resolve(assetDirectory, "perf-run.json"), "utf8"),
);

const light = {
  background: "#ffffff",
  panel: "#fafaf9",
  ink: "#1c1917",
  muted: "#57534e",
  track: "#e7e5e4",
  zod: "#2563eb",
  adaptate: "#b45309",
  valibot: "#0f766e",
  min: "#b45309",
  gzip: "#78716c",
};

const dark = {
  background: "#0c0a09",
  panel: "#1c1917",
  ink: "#f5f5f4",
  muted: "#a8a29e",
  track: "#44403c",
  zod: "#60a5fa",
  adaptate: "#fdba74",
  valibot: "#5eead4",
  min: "#fdba74",
  gzip: "#a8a29e",
};

function group(value) {
  const rounded = Math.round(value);
  return String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function text(x, y, content, fill, size, weight = "400") {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(content)}</text>`;
}

function barRow(theme, x, y, trackWidth, labelWidth, label, value, maximum, display, color) {
  const barWidth = maximum > 0 ? (value / maximum) * trackWidth : 0;
  const barX = x + labelWidth;
  const barY = y - 11;
  return [
    text(x, y, label, theme.muted, 12),
    `<rect x="${barX}" y="${barY}" width="${trackWidth}" height="14" rx="2" fill="${theme.track}"/>`,
    `<rect x="${barX}" y="${barY}" width="${Math.max(barWidth, 0)}" height="14" rx="2" fill="${color}"/>`,
    text(barX + trackWidth + 8, y, display, theme.ink, 12, "600"),
  ].join("");
}

function panel(theme, x, y, width, height, title, note) {
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${theme.panel}"/>`,
    text(x + 16, y + 24, title, theme.ink, 15, "700"),
    text(x + 16, y + 42, note, theme.muted, 11),
  ].join("");
}

function libraryBars(theme, x, y, width, rows, maximum) {
  const labelWidth = 72;
  const valueWidth = 88;
  const trackWidth = width - 32 - labelWidth - valueWidth;
  return rows
    .map((row, index) =>
      barRow(
        theme,
        x + 16,
        y + index * 28,
        trackWidth,
        labelWidth,
        row.label,
        row.value,
        maximum,
        row.display,
        row.color,
      ),
    )
    .join("");
}

function chart(theme) {
  const width = 960;
  const height = 700;
  const fullMaximum = Math.max(
    measurement.fullDocument.zod,
    measurement.fullDocument.adaptate,
    measurement.fullDocument.valibot,
  );
  const importMaximum = Math.max(
    measurement.importMedianMs.zod,
    measurement.importMedianMs.adaptate,
    measurement.importMedianMs.valibot,
  );
  const heapMaximum = Math.max(
    measurement.heapAfterBytes.zod,
    measurement.heapAfterBytes.adaptate,
    measurement.heapAfterBytes.valibot,
  );
  const streamMaximum = Math.max(
    measurement.agUiMicros.zod,
    measurement.agUiMicros.adaptate,
    measurement.agUiMicros.valibot,
    measurement.parsedPartialMicros.zod,
    measurement.parsedPartialMicros.adaptate,
    measurement.parsedPartialMicros.valibot,
  );
  const bundleMaximum = Math.max(
    ...measurement.bundleOwn.flatMap((entry) => [entry.minBytes, entry.gzipBytes]),
  );
  const libraries = [
    ["zod", theme.zod],
    ["adaptate", theme.adaptate],
    ["valibot", theme.valibot],
  ];
  const triples = (source, format) =>
    libraries.map(([label, color]) => ({
      label,
      value: source[label],
      display: format(source[label]),
      color,
    }));
  const title = `Node ${measurement.runtimeVersion}`;
  const subtitle = measurement.runId
    ? `commit ${measurement.commit} · run ${measurement.runId}`
    : `commit ${measurement.commit}`;
  const summary = [
    title,
    subtitle,
    `Full document validations/sec: zod ${group(measurement.fullDocument.zod)}, adaptate ${group(measurement.fullDocument.adaptate)}, valibot ${group(measurement.fullDocument.valibot)}.`,
    `Import median ms: zod ${measurement.importMedianMs.zod.toFixed(3)}, adaptate ${measurement.importMedianMs.adaptate.toFixed(3)}, valibot ${measurement.importMedianMs.valibot.toFixed(3)}.`,
    `Heap after GC bytes: zod ${group(measurement.heapAfterBytes.zod)}, adaptate ${group(measurement.heapAfterBytes.adaptate)}, valibot ${group(measurement.heapAfterBytes.valibot)}.`,
    `Bundle own min/gzip bytes, zod external: ${measurement.bundleOwn.map((entry) => `${entry.id} ${group(entry.minBytes)}/${group(entry.gzipBytes)}`).join(", ")}. ./effect also keeps effect external.`,
    `Parsed partial µs/chunk: zod ${measurement.parsedPartialMicros.zod.toFixed(3)}, adaptate ${measurement.parsedPartialMicros.adaptate.toFixed(3)}, valibot ${measurement.parsedPartialMicros.valibot.toFixed(3)}.`,
    `AG-UI µs/chunk, JSON repair included for adaptate: zod ${measurement.agUiMicros.zod.toFixed(3)}, adaptate ${measurement.agUiMicros.adaptate.toFixed(3)}, valibot ${measurement.agUiMicros.valibot.toFixed(3)}.`,
  ].join(" ");

  const panelWidth = 296;
  const panelGap = 16;
  const left = 20;
  const top = 78;
  const shortHeight = 168;
  const tallHeight = 360;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${escapeXml(summary)}</title>`,
    `<rect width="${width}" height="${height}" fill="${theme.background}"/>`,
    text(left, 32, title, theme.ink, 18, "700"),
    text(left, 54, subtitle, theme.muted, 12),
    panel(theme, left, top, panelWidth, shortHeight, "Full document", "validations/sec"),
    libraryBars(
      theme,
      left,
      top + 72,
      panelWidth,
      triples(measurement.fullDocument, group),
      fullMaximum,
    ),
    panel(
      theme,
      left + panelWidth + panelGap,
      top,
      panelWidth,
      shortHeight,
      "Import",
      "median ms, plus one validation",
    ),
    libraryBars(
      theme,
      left + panelWidth + panelGap,
      top + 72,
      panelWidth,
      triples(measurement.importMedianMs, (value) => value.toFixed(3)),
      importMaximum,
    ),
    panel(
      theme,
      left + (panelWidth + panelGap) * 2,
      top,
      panelWidth,
      shortHeight,
      "Heap",
      "bytes after GC",
    ),
    libraryBars(
      theme,
      left + (panelWidth + panelGap) * 2,
      top + 72,
      panelWidth,
      triples(measurement.heapAfterBytes, group),
      heapMaximum,
    ),
  ];

  const bundleX = left;
  const bundleY = top + shortHeight + panelGap;
  const bundleWidth = 452;
  parts.push(
    panel(
      theme,
      bundleX,
      bundleY,
      bundleWidth,
      tallHeight,
      "Bundle",
      `min and gzip, zod external · esbuild ${measurement.esbuildVersion}`,
    ),
  );
  const bundleRows = [];
  for (const entry of measurement.bundleOwn) {
    bundleRows.push({
      label: entry.id,
      value: entry.minBytes,
      display: group(entry.minBytes),
      color: theme.min,
      kind: "min",
    });
    bundleRows.push({
      label: "gzip",
      value: entry.gzipBytes,
      display: group(entry.gzipBytes),
      color: theme.gzip,
      kind: "gzip",
    });
  }
  const bundleLabelWidth = 92;
  const bundleValueWidth = 52;
  const bundleTrack = bundleWidth - 32 - bundleLabelWidth - bundleValueWidth;
  bundleRows.forEach((row, index) => {
    parts.push(
      barRow(
        theme,
        bundleX + 16,
        bundleY + 72 + index * 32,
        bundleTrack,
        bundleLabelWidth,
        row.label,
        row.value,
        bundleMaximum,
        row.display,
        row.color,
      ),
    );
  });
  parts.push(
    text(
      bundleX + 16,
      bundleY + tallHeight - 18,
      "The entry row is minified bytes. The gzip row is gzip bytes.",
      theme.muted,
      11,
    ),
  );

  const streamX = left + bundleWidth + panelGap;
  const streamY = bundleY;
  const streamWidth = 452;
  parts.push(
    panel(
      theme,
      streamX,
      streamY,
      streamWidth,
      tallHeight,
      "Per chunk",
      "µs. AG-UI includes JSON repair",
    ),
  );
  const streamRows = [
    { label: "parsed", heading: true },
    ...triples(measurement.parsedPartialMicros, (value) => value.toFixed(3)),
    { label: "AG-UI", heading: true },
    ...triples(measurement.agUiMicros, (value) => value.toFixed(3)),
  ];
  let streamCursor = streamY + 68;
  for (const row of streamRows) {
    if (row.heading) {
      parts.push(text(streamX + 16, streamCursor, row.label, theme.ink, 12, "700"));
      streamCursor += 22;
      continue;
    }
    const labelWidth = 72;
    const valueWidth = 52;
    const trackWidth = streamWidth - 32 - labelWidth - valueWidth;
    parts.push(
      barRow(
        theme,
        streamX + 16,
        streamCursor,
        trackWidth,
        labelWidth,
        row.label,
        row.value,
        streamMaximum,
        row.display,
        row.color,
      ),
    );
    streamCursor += 28;
  }

  parts.push("</svg>");
  return parts.join("\n");
}

writeFileSync(resolve(assetDirectory, "perf.svg"), chart(light));
writeFileSync(resolve(assetDirectory, "perf-dark.svg"), chart(dark));
