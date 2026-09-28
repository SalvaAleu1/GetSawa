import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const self = path.normalize("scripts/ops/check-brand-consistency.mjs");
const ignoredDirectories = new Set([".git", "node_modules", ".next", ".open-next", ".wrangler"]);
const protectedRepo = "SalvaAleu1/" + "Get" + "Sawa";
const protectedToken = "__CLOUDSAWA_REPOSITORY_PATH__";
const banned = [
  "Get" + "Sawa",
  "GET" + "SAWA",
  "getsawa.app",
  "cloudsawa.app",
  "getsawa",
];

const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!entry.isFile() || path.normalize(relative) === self) continue;

    const buffer = fs.readFileSync(absolute);
    if (buffer.includes(0)) continue;

    let text;
    try {
      text = buffer.toString("utf8");
    } catch {
      continue;
    }

    const normalized = text.split(protectedRepo).join(protectedToken);
    const matches = banned.filter((token) => normalized.includes(token));
    const splitWordmark = /Get\s*<[^>\n]{0,200}>\s*Sawa/.test(normalized);
    if (matches.length || splitWordmark) {
      failures.push({
        file: relative,
        matches: [...matches, ...(splitWordmark ? ["split Get/Sawa wordmark"] : [])],
      });
    }
  }
}

walk(root);

if (failures.length) {
  console.error("Legacy or incorrect CloudSawa branding remains:");
  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.matches.join(", ")}`);
  }
  process.exit(1);
}

console.log("CloudSawa brand consistency check passed. The legacy GitHub repository path is the only allowed old-name reference.");
