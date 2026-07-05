// Scrapes ONE Hitesh live-stream transcript and distills it into a compact
// "how he speaks live" note — for exact tone & behaviour, not topics.
//
// Why distill (not dump raw): a full live transcript is ~6k–26k tokens. Adding
// that raw to the system prompt would cost that on EVERY message. Distilling to
// ~600 tokens keeps the live voice while staying cheap per turn.
//
// Output: data/live-style.md  (read by server/index.js into the system prompt)
// Run:    npm run scrape:live      (override video with LIVE_VIDEO_ID=<id>)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";
import { YoutubeTranscript } from "youtube-transcript";
import { getPersona, DEFAULT_PERSONA } from "../data/personas.js";

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// which persona? `npm run scrape:live -- piyush`  (or PERSONA=piyush)
const cfg = getPersona(process.argv[2] || process.env.PERSONA || DEFAULT_PERSONA);
const DATA_DIR = path.join(__dirname, "..", "data", cfg.dir);
const RAW_DIR = path.join(DATA_DIR, "raw");

// Default = the persona's configured (shortish) live stream. Override via env.
const VIDEO_ID = process.env.LIVE_VIDEO_ID || cfg.youtube.liveVideoId;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env — needed to distill the transcript.");
  process.exit(1);
}

async function main() {
  console.log(`Fetching transcript for live stream ${VIDEO_ID} …`);
  const segs = await YoutubeTranscript.fetchTranscript(VIDEO_ID);
  const transcript = segs.map((x) => x.text).join(" ").replace(/\s+/g, " ").trim();
  console.log(`  transcript: ${transcript.length} chars`);

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RAW_DIR, "live-transcript.json"),
    JSON.stringify({ videoId: VIDEO_ID, scrapedAt: new Date().toISOString(), transcript }, null, 2)
  );

  console.log("Distilling live tone & behaviour with Gemini …");
  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4000, // headroom: 2.5-flash "thinking" tokens count against this, so keep it generous
    messages: [
      {
        role: "system",
        content:
          `You analyze a raw YouTube live-stream auto-transcript of ${cfg.name} (${cfg.brand}) ` +
          "and extract HOW he speaks — tone, energy, and behaviour on a live stream. " +
          "IGNORE topics/content. Output tight markdown, no preamble, under 300 words, with sections: " +
          "'## Live openings & greetings' (exact phrases he uses to start/greet viewers), " +
          "'## Signature phrases & fillers' (recurring words/expressions, verbatim), " +
          "'## How he behaves with the audience' (reads names, asks to like/comment, chai references, humour, pacing), " +
          "'## Energy & rhythm' (short bullets on his live vibe). " +
          "Write EVERYTHING in Roman-script Hinglish (Hindi words in English letters) — NEVER use Devanagari. " +
          "Transliterate his phrases to Roman, e.g. 'Haanji kaise hain aap sabhi' not 'हां जी'.",
      },
      { role: "user", content: `Live transcript:\n\n${transcript}` },
    ],
  });

  const note = (res.choices?.[0]?.message?.content || "").trim();
  if (!note) throw new Error("Empty distillation from model.");

  const md = `# How ${cfg.name} speaks on live streams (match this energy)\n_Distilled from a real ${cfg.brand} live stream (video ${VIDEO_ID})._\n\n${note}\n`;
  const out = path.join(DATA_DIR, "live-style.md");
  fs.writeFileSync(out, md);
  console.log(`\nDone. live-style.md <- ${md.length} chars (~${Math.round(md.length / 4)} tokens) -> ${out}`);
  console.log("Restart the server (npm run dev) to load it into the system prompt.");
}

main().catch((e) => {
  console.error("\nFailed:", e.message);
  process.exit(1);
});
