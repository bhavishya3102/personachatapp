// Turns raw scraped data (data/raw/*.json) into the two files the chat server reads:
//   data/examples.json  — real comment->reply pairs (few-shot persona voice)
//   data/knowledge.md   — grounding: what Hitesh teaches / talks about
//
// No LLM, no embeddings — just simple assembly.  Run:  npm run build:persona

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPersona, DEFAULT_PERSONA } from "../data/personas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// which persona? `npm run build:persona -- piyush`  (or PERSONA=piyush)
const cfg = getPersona(process.argv[2] || process.env.PERSONA || DEFAULT_PERSONA);
const DATA = path.join(__dirname, "..", "data", cfg.dir);
const RAW = path.join(DATA, "raw");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
const clean = (s = "") => s.replace(/\s+/g, " ").trim();

const yt = readJson(path.join(RAW, "youtube.json"), null);
const web = readJson(path.join(RAW, "website.json"), null);

if (!yt && !web) {
  console.error("No raw data found. Run `npm run scrape:yt` and/or `npm run scrape:web` first.");
  process.exit(1);
}

// ---- examples.json  <- Hitesh's actual replies ----
if (yt?.qaPairs?.length) {
  const seen = new Set();
  const pairs = yt.qaPairs
    .map((p) => ({ question: clean(p.question), answer: clean(p.answer) }))
    .filter((p) => p.question.length > 4 && p.answer.length > 4 && p.answer.length < 800)
    .filter((p) => {
      const key = (p.question + "|||" + p.answer).toLowerCase();
      if (seen.has(key)) return false; // drop duplicates
      seen.add(key);
      return true;
    })
    .slice(0, 150);

  fs.writeFileSync(
    path.join(DATA, "examples.json"),
    JSON.stringify(
      { _note: "Auto-generated from real YouTube comment->reply pairs.", generatedAt: new Date().toISOString(), pairs },
      null,
      2
    )
  );
  console.log(`examples.json  <- ${pairs.length} real reply pairs`);
} else {
  console.log("No YouTube reply pairs found — keeping existing seed examples.json.");
}

// ---- knowledge.md  <- website + video titles ----
const lines = [`# ${cfg.name} — reference (auto-generated)\n`];
if (yt?.channelTitle) lines.push(`Channel: **${yt.channelTitle}** (youtube.com/@${cfg.youtube.handle})\n`);

if (yt?.videos?.length) {
  lines.push("## Recent video topics");
  for (const v of yt.videos.slice(0, 15)) lines.push(`- ${clean(v.title)}`);
  lines.push("");
}
if (web?.pages?.length) {
  lines.push("## From his sites");
  for (const pg of web.pages) {
    lines.push(`### ${pg.title || pg.url}`);
    lines.push(clean(pg.text).slice(0, 1500));
    lines.push("");
  }
}

if (lines.length > 1) {
  fs.writeFileSync(path.join(DATA, "knowledge.md"), lines.join("\n"));
  console.log("knowledge.md   <- updated from scraped data");
} else {
  console.log("No website/video data — keeping existing seed knowledge.md.");
}

console.log("\nDone. Restart the server (npm run dev) to load the new persona context.");
