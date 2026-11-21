import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const assetDirectory = join(repositoryRoot, "assets");

const fontCandidates = {
  sans: [
    "/usr/share/fonts/truetype/macos/Inter-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ],
  sansBold: [
    "/usr/share/fonts/truetype/macos/Inter-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ],
  mono: [
    "/usr/share/fonts/truetype/macos/JetBrainsMono-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
  ],
};

function firstExisting(paths) {
  for (const fontPath of paths) {
    if (existsSync(fontPath)) return fontPath;
  }
  throw new Error(`No font found among ${paths.join(", ")}`);
}

const sansFont = firstExisting(fontCandidates.sans);
const sansBoldFont = firstExisting(fontCandidates.sansBold);
const monoFont = firstExisting(fontCandidates.mono);

const width = 760;
const height = 440;

const themes = [
  {
    fileName: "stream-demo.gif",
    paper: "0xF4F0E8",
    ink: "0x1C1917",
    muted: "0x78716C",
    line: "0xE7E5E4",
    card: "0xFFFFFF",
    ready: "0x166534",
    readyFill: "0xDCFCE7",
    pending: "0x9A3412",
    pendingFill: "0xFFEDD5",
    typing: "0x57534E",
    typingFill: "0xE7E5E4",
  },
  {
    fileName: "stream-demo-dark.gif",
    paper: "0x141210",
    ink: "0xF5F0E8",
    muted: "0xA8A29E",
    line: "0x44403C",
    card: "0x1C1917",
    ready: "0x86EFAC",
    readyFill: "0x14532D",
    pending: "0xFDBA74",
    pendingFill: "0x7C2D12",
    typing: "0xD6D3D1",
    typingFill: "0x292524",
  },
];

function box(x, y, boxWidth, boxHeight, fill, border) {
  return [
    `drawbox=x=${x}:y=${y}:w=${boxWidth}:h=${boxHeight}:color=${fill}:t=fill`,
    `drawbox=x=${x}:y=${y}:w=${boxWidth}:h=${boxHeight}:color=${border}:t=2`,
  ];
}

function label(textFile, fontFile, size, color, x, y) {
  return `drawtext=fontfile=${fontFile}:textfile=${textFile}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;
}

const steps = [
  { json: '{"title":"Pasta"}', card: "ready", kitchen: "not yet", hold: 1.3 },
  { json: '{"title":"Pasta","ser', card: "typing", kitchen: "typing", hold: 0.35 },
  { json: '{"title":"Pasta","servings":', card: "typing", kitchen: "typing", hold: 0.35 },
  { json: '{"title":"Pasta","servings":2}', card: "ready", kitchen: "ready", hold: 1.4 },
  { json: '{"ti', card: "typing", kitchen: "typing", hold: 0.3 },
  { json: '{"title":"Pas', card: "typing", kitchen: "typing", hold: 0.4 },
];

const pillCopy = {
  ready: "ready",
  "not yet": "not yet",
  typing: "typing",
};

function pill(theme, x, y, state) {
  const fill = state === "ready" ? theme.readyFill : state === "not yet" ? theme.pendingFill : theme.typingFill;
  const border = state === "ready" ? theme.ready : state === "not yet" ? theme.pending : theme.typing;
  return {
    filters: box(x, y, 118, 32, fill, border),
    text: pillCopy[state],
    color: border,
    x: x + 16,
    y: y + 6,
  };
}

function frameFilters(theme, workDirectory, step, index) {
  const cardBorder = step.card === "ready" ? theme.ready : step.card === "not yet" ? theme.pending : theme.line;
  const kitchenBorder = step.kitchen === "ready" ? theme.ready : step.kitchen === "not yet" ? theme.pending : theme.line;
  const filters = [
    ...box(28, 78, 210, 148, theme.card, theme.line),
    ...box(390, 78, 342, 68, theme.card, cardBorder),
    ...box(390, 158, 342, 68, theme.card, kitchenBorder),
    `drawbox=x=248:y=108:w=134:h=4:color=${theme.ink}:t=fill`,
    `drawbox=x=248:y=188:w=134:h=4:color=${theme.ink}:t=fill`,
    `drawbox=x=248:y=108:w=4:h=84:color=${theme.ink}:t=fill`,
    ...box(28, 250, 704, 150, theme.card, theme.line),
  ];
  const texts = [
    ["One recipe. Two screens.", sansBoldFont, 28, theme.ink, 28, 24],
    ["Recipe", sansBoldFont, 22, theme.ink, 48, 108],
    ["title, servings", sansFont, 18, theme.muted, 48, 146],
    ["Card", sansBoldFont, 22, theme.ink, 410, 98],
    ["the dish name", sansFont, 16, theme.muted, 410, 124],
    ["Kitchen", sansBoldFont, 22, theme.ink, 410, 178],
    ["how many people", sansFont, 16, theme.muted, 410, 204],
    ["Still arriving", sansFont, 16, theme.muted, 48, 268],
    [`${step.json}▌`, monoFont, 22, theme.ink, 48, 328],
  ];
  const cardPill = pill(theme, 584, 96, step.card);
  const kitchenPill = pill(theme, 584, 176, step.kitchen);
  filters.push(...cardPill.filters, ...kitchenPill.filters);
  const textJobs = [
    ...texts.map(([text, fontFile, size, color, x, y]) => ({ text, fontFile, size, color, x, y })),
    { text: cardPill.text, fontFile: sansBoldFont, size: 16, color: cardPill.color, x: cardPill.x, y: cardPill.y },
    { text: kitchenPill.text, fontFile: sansBoldFont, size: 16, color: kitchenPill.color, x: kitchenPill.x, y: kitchenPill.y },
  ];
  for (let textIndex = 0; textIndex < textJobs.length; textIndex += 1) {
    const job = textJobs[textIndex];
    const textPath = join(workDirectory, `frame-${theme.fileName}-${index}-text-${textIndex}.txt`);
    writeFileSync(textPath, job.text);
    filters.push(label(textPath, job.fontFile, job.size, job.color, job.x, job.y));
  }
  return filters.join(",");
}

function renderTheme(theme) {
  const workDirectory = mkdtempSync(join(tmpdir(), "adaptate-readme-demo-"));
  try {
    const framePaths = [];
    for (let index = 0; index < steps.length; index += 1) {
      const framePath = join(workDirectory, `frame-${String(index).padStart(2, "0")}.png`);
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=${theme.paper}:s=${width}x${height}`,
          "-frames:v",
          "1",
          "-vf",
          frameFilters(theme, workDirectory, steps[index], index),
          framePath,
        ],
        { stdio: "ignore" },
      );
      framePaths.push(framePath);
    }
    const concatLines = [];
    for (let index = 0; index < framePaths.length; index += 1) {
      concatLines.push(`file '${framePaths[index]}'`);
      concatLines.push(`duration ${steps[index].hold}`);
    }
    concatLines.push(`file '${framePaths[framePaths.length - 1]}'`);
    const concatPath = join(workDirectory, "frames.txt");
    writeFileSync(concatPath, `${concatLines.join("\n")}\n`);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-vf",
        "fps=10,split[a][b];[a]palettegen=max_colors=64:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer",
        "-loop",
        "0",
        join(assetDirectory, theme.fileName),
      ],
      { stdio: "ignore" },
    );
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

mkdirSync(assetDirectory, { recursive: true });
for (const theme of themes) renderTheme(theme);
