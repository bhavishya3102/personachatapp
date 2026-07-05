// Chat backend: Express + Gemini (via the OpenAI-compatible API), streaming,
// with a MOCK fallback so the UI works before you have a key.
//
// Uses the official `openai` SDK pointed at Google's OpenAI-compatible endpoint:
//   https://generativelanguage.googleapis.com/v1beta/openai/
//
// Flow per message:
//   system  = persona + scraped knowledge + real example replies (built per persona)
//   messages = [system] + conversation history from the client
//   -> Gemini (streamed token-by-token back to the browser)
//
// Multi-persona: the client sends { persona: "hitesh" | "piyush", messages }.
// One system prompt is built per persona at startup (see data/personas.js).

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PERSONAS, getPersona, DEFAULT_PERSONA } from "../data/personas.js";

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // gemini-2.5-pro for best fidelity
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const MAX_TOKENS = 2048;
const PORT = process.env.PORT || 8787;
const MOCK = process.env.MOCK === "1" || !API_KEY;

// ---------- build the persona system prompt once at startup ----------
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
  const examples = loadExamplePairs(dir).slice(0, 20); // few-shot set (raise for more of his voice; costs a few tokens)
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

// one prompt per persona, built once at startup
const SYSTEM_PROMPTS = Object.fromEntries(
  Object.values(PERSONAS).map((cfg) => [cfg.id, buildSystemPrompt(cfg)])
);
const client = MOCK ? null : new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

// ---------- server ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/avatars", express.static(path.join(DATA_DIR, "assets"))); // persona photos

app.get("/health", (_req, res) => {
  res.json({ ok: true, mock: MOCK, provider: "gemini (openai-compatible)", model: MODEL, hasKey: !!API_KEY });
});

// personas the UI can toggle between (metadata only — no prompts leaked)
app.get("/personas", (_req, res) => {
  const list = Object.values(PERSONAS).map(({ id, name, brand, emoji, avatar, tagline, greeting }) => ({
    id, name, brand, emoji, tagline, greeting,
    avatar: avatar ? `/avatars/${avatar}` : null, // photo URL served by this server
  }));
  res.json({ personas: list, default: DEFAULT_PERSONA });
});

app.post("/chat", async (req, res) => {
  const cfg = getPersona(req.body?.persona); // falls back to default for unknown/missing
  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const turns = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    res.status(400).json({ error: "messages must be a non-empty list ending with a user turn." });
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  if (MOCK) return streamMock(res, cfg);

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPTS[cfg.id] }, ...turns.slice(-10)],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) res.write(delta);
    }
    res.end();
  } catch (err) {
    console.error("Gemini error:", err?.message || err);
    if (!res.headersSent) res.status(500);
    res.write("\n\n[arre, ek chhoti si dikkat aa gayi — thodi der baad try kijiye. (server error)]");
    res.end();
  }
});

async function streamMock(res, cfg) {
  const reply =
    `${cfg.emoji} Abhi main (${cfg.name}) MOCK mode mein hoon — matlab Gemini connect nahi hai. ` +
    "Bas itna kijiye: project ke `.env` mein apni GEMINI_API_KEY daal dijiye " +
    "(aistudio.google.com/apikey se free milegi), server restart kijiye, aur phir main bilkul apni " +
    "asli tone mein aapke coding doubts solve karunga. 🔥";
  for (const word of reply.split(" ")) {
    res.write(word + " ");
    await new Promise((r) => setTimeout(r, 30));
  }
  res.end();
}

app.listen(PORT, () => {
  console.log(`\n🎭 Persona chat server -> http://localhost:${PORT}`);
  console.log(`   mode: ${MOCK ? "MOCK (set GEMINI_API_KEY to go live)" : "LIVE — gemini via openai-compatible (" + MODEL + ")"}`);
  for (const cfg of Object.values(PERSONAS)) {
    console.log(`   persona ${cfg.id.padEnd(7)} ${cfg.emoji}  system prompt: ${SYSTEM_PROMPTS[cfg.id].length} chars`);
  }
  console.log("");
});
