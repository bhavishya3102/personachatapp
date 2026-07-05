// Shared persona prompt-building — used by BOTH the local Express server
// (server/index.js) and the Vercel serverless functions (api/*.js), so the
// system-prompt logic lives in exactly one place.
//
// For each persona it assembles: seed voice (persona.js) + knowledge.md
// + live-style.md + a few real example replies. Built once per cold start.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS } from "../data/personas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function readIfExists(p, fallback = "") {
  try { return fs.readFileSync(p, "utf8"); } catch { return fallback; }
}

function loadExamplePairs(dir) {
  try {
    const raw = JSON.parse(readIfExists(path.join(dir, "examples.json"), "{}"));
    return Array.isArray(raw.pairs) ? raw.pairs : [];
  } catch { return []; }
}

function buildSystemPrompt(cfg) {
  const dir = path.join(DATA_DIR, cfg.dir);
  const knowledge = readIfExists(path.join(dir, "knowledge.md")).trim();
  const liveStyle = readIfExists(path.join(dir, "live-style.md")).trim(); // distilled live tone (npm run scrape:live)
  const examples = loadExamplePairs(dir).slice(0, 20); // few-shot set (raise for more of their voice; costs a few tokens)
  const examplesText = examples
    .map((p, i) => `Example ${i + 1}\nComment: ${p.question}\n${cfg.name}: ${p.answer}`)
    .join("\n\n");

  return [
    cfg.persona.trim(),
    knowledge ? `# What you teach / your world (reference)\n${knowledge}` : "",
    liveStyle,
    examplesText ? `# Real examples of how you reply (match this voice)\n${examplesText}` : "",
  ].filter(Boolean).join("\n\n");
}

// one prompt per persona, built once at module load (cold start)
export const SYSTEM_PROMPTS = Object.fromEntries(
  Object.values(PERSONAS).map((cfg) => [cfg.id, buildSystemPrompt(cfg)])
);
