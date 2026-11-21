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
const paper = "0xF4F0E8";
const ink = "0x1C1917";
const muted = "0x78716C";
const line = "0xE7E5E4";
const white = "0xFFFFFF";
const green = "0x166534";
const greenFill = "0xDCFCE7";
const amber = "0x9A3412";
const amberFill = "0xFFEDD5";

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
  { json: '{"title":"Pasta"', card: "ready", kitchen: "waiting", hold: 1.1 },
  { json: '{"title":"Pasta","serv', card: "ready", kitchen: "waiting", hold: 0.4 },
  { json: '{"title":"Pasta","servings":', card: "ready", kitchen: "waiting", hold: 0.4 },
  { json: '{"title":"Pasta","servings":2}', card: "ready", kitchen: "ready", hold: 1.3 },
  { json: "", card: "waiting", kitchen: "waiting", hold: 0.35 },
  { json: "{", card: "waiting", kitchen: "waiting", hold: 0.3 },
  { json: '{"title"', card: "waiting", kitchen: "waiting", hold: 0.3 },
  { json: '{"title":"Pas', card: "waiting", kitchen: "waiting", hold: 0.35 },
];

function pill(x, y, state) {
  const ready = state === "ready";
  const fill = ready ? greenFill : amberFill;
  const border = ready ? green : amber;
  const text = ready ? "ready" : "waiting";
  return { filters: box(x, y, 108, 32, fill, border), text, color: border, x: x + 16, y: y + 6 };
}

function frameFilters(workDirectory, step, index) {
  const cardBorder = step.card === "ready" ? green : line;
  const kitchenBorder = step.kitchen === "ready" ? green : line;
  const filters = [
    ...box(28, 78, 210, 148, white, line),
    ...box(390, 78, 342, 68, white, cardBorder),
    ...box(390, 158, 342, 68, white, kitchenBorder),
    `drawbox=x=248:y=108:w=134:h=4:color=${ink}:t=fill`,
    `drawbox=x=248:y=188:w=134:h=4:color=${ink}:t=fill`,
    `drawbox=x=248:y=108:w=4:h=84:color=${ink}:t=fill`,
    ...box(28, 250, 704, 150, white, line),
  ];
  const texts = [
    ["One recipe. Two screens.", sansBoldFont, 28, ink, 28, 24],
    ["Recipe", sansBoldFont, 22, ink, 48, 108],
    ["title, servings", sansFont, 18, muted, 48, 146],
    ["Card", sansBoldFont, 22, ink, 410, 98],
    ["the dish name", sansFont, 16, muted, 410, 124],
    ["Kitchen", sansBoldFont, 22, ink, 410, 178],
    ["how many people", sansFont, 16, muted, 410, 204],
    ["Still arriving", sansFont, 16, muted, 48, 268],
    [`${step.json}▌`, monoFont, 22, ink, 48, 328],
  ];
  const cardPill = pill(590, 96, step.card);
  const kitchenPill = pill(590, 176, step.kitchen);
  filters.push(...cardPill.filters, ...kitchenPill.filters);
  const textJobs = [
    ...texts.map(([text, fontFile, size, color, x, y]) => ({ text, fontFile, size, color, x, y })),
    { text: cardPill.text, fontFile: sansBoldFont, size: 16, color: cardPill.color, x: cardPill.x, y: cardPill.y },
    { text: kitchenPill.text, fontFile: sansBoldFont, size: 16, color: kitchenPill.color, x: kitchenPill.x, y: kitchenPill.y },
  ];
  for (let textIndex = 0; textIndex < textJobs.length; textIndex += 1) {
    const job = textJobs[textIndex];
    const textPath = join(workDirectory, `frame-${index}-text-${textIndex}.txt`);
    writeFileSync(textPath, job.text);
    filters.push(label(textPath, job.fontFile, job.size, job.color, job.x, job.y));
  }
  return filters.join(",");
}

function writeStillSvg() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="250" viewBox="0 0 760 250" role="img" aria-label="One recipe description feeds a card and a kitchen screen">
  <rect width="760" height="250" fill="#F4F0E8"/>
  <rect x="28" y="48" width="210" height="148" rx="12" fill="#FFFFFF" stroke="#E7E5E4" stroke-width="2"/>
  <text x="48" y="108" fill="#1C1917" font-family="Inter, DejaVu Sans, sans-serif" font-size="22" font-weight="700">Recipe</text>
  <text x="48" y="140" fill="#78716C" font-family="Inter, DejaVu Sans, sans-serif" font-size="16">title, servings</text>
  <rect x="248" y="78" width="4" height="84" fill="#1C1917"/>
  <rect x="248" y="78" width="134" height="4" fill="#1C1917"/>
  <rect x="248" y="158" width="134" height="4" fill="#1C1917"/>
  <rect x="390" y="48" width="342" height="68" rx="12" fill="#FFFFFF" stroke="#166534" stroke-width="2"/>
  <text x="410" y="78" fill="#1C1917" font-family="Inter, DejaVu Sans, sans-serif" font-size="20" font-weight="700">Card</text>
  <text x="410" y="100" fill="#78716C" font-family="Inter, DejaVu Sans, sans-serif" font-size="15">the dish name</text>
  <rect x="600" y="66" width="108" height="32" rx="16" fill="#DCFCE7"/>
  <text x="628" y="87" fill="#166534" font-family="Inter, DejaVu Sans, sans-serif" font-size="15" font-weight="700">ready</text>
  <rect x="390" y="128" width="342" height="68" rx="12" fill="#FFFFFF" stroke="#E7E5E4" stroke-width="2"/>
  <text x="410" y="158" fill="#1C1917" font-family="Inter, DejaVu Sans, sans-serif" font-size="20" font-weight="700">Kitchen</text>
  <text x="410" y="180" fill="#78716C" font-family="Inter, DejaVu Sans, sans-serif" font-size="15">how many people</text>
  <rect x="600" y="146" width="108" height="32" rx="16" fill="#FFEDD5"/>
  <text x="618" y="167" fill="#9A3412" font-family="Inter, DejaVu Sans, sans-serif" font-size="15" font-weight="700">waiting</text>
</svg>
`;
  writeFileSync(join(assetDirectory, "one-schema.svg"), svg);
}

const workDirectory = mkdtempSync(join(tmpdir(), "adaptate-readme-demo-"));
mkdirSync(assetDirectory, { recursive: true });
writeStillSvg();

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
        `color=c=${paper}:s=${width}x${height}`,
        "-frames:v",
        "1",
        "-vf",
        frameFilters(workDirectory, steps[index], index),
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
  const gifPath = join(assetDirectory, "stream-demo.gif");
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
      "fps=10,split[a][b];[a]palettegen=max_colors=48:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer",
      "-loop",
      "0",
      gifPath,
    ],
    { stdio: "ignore" },
  );
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
