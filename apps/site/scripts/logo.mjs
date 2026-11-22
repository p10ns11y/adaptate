import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let palette = JSON.parse(readFileSync(join(siteDirectory, "palette.json"), "utf8")).tokens;
let hex = (name) => palette[name].hex;

function markDefinitions(prefix) {
  return [
    `<linearGradient id="${prefix}G" x1="16" y1="25" x2="16" y2="7" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${hex("thrust")}"/>`,
    `<stop offset="0.42" stop-color="${hex("plume-core")}"/>`,
    `<stop offset="1" stop-color="${hex("cloud")}"/>`,
    `</linearGradient>`,
    `<linearGradient id="${prefix}B" x1="16" y1="25.6" x2="16" y2="20.6" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${hex("plume-core")}"/>`,
    `<stop offset="1" stop-color="${hex("thrust")}"/>`,
    `</linearGradient>`,
  ].join("");
}

function markBody(prefix) {
  return [
    `<rect width="32" height="32" rx="7" fill="${hex("void")}"/>`,
    `<path d="M8 23.55C9.35 21.5 13.35 11.55 14.4 7.15" fill="none" stroke="url(#${prefix}G)" stroke-width="3.3" stroke-linecap="round"/>`,
    `<path d="M24 23.55C22.65 21.5 18.65 11.55 17.6 7.15" fill="none" stroke="url(#${prefix}G)" stroke-width="3.3" stroke-linecap="round"/>`,
    `<ellipse cx="16" cy="23.9" rx="3.05" ry="2.25" fill="url(#${prefix}B)"/>`,
    `<circle cx="16" cy="23.65" r="1.1" fill="${hex("plume-core")}"/>`,
  ].join("");
}

let mark = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="adaptate">`,
  `<defs>${markDefinitions("m")}</defs>`,
  markBody("m"),
  `</svg>`,
].join("");

let smallMark = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="adaptate">`,
  `<rect width="32" height="32" rx="7" fill="${hex("void")}"/>`,
  `<path d="M7.7 23.4C9.2 21.15 13.2 11.5 14.3 7.05" fill="none" stroke="${hex("cloud")}" stroke-width="3.85" stroke-linecap="round"/>`,
  `<path d="M24.3 23.4C22.8 21.15 18.8 11.5 17.7 7.05" fill="none" stroke="${hex("cloud")}" stroke-width="3.85" stroke-linecap="round"/>`,
  `<circle cx="16" cy="23.7" r="2.65" fill="${hex("thrust")}"/>`,
  `</svg>`,
].join("");

writeFileSync(join(siteDirectory, "public/mark.svg"), `${mark}\n`);
writeFileSync(join(siteDirectory, "public/favicon.svg"), `${smallMark}\n`);
console.log("Wrote the mark and the favicon.");
