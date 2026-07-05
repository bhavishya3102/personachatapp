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
import OpenAI from "openai";
import { PERSONAS, getPersona, DEFAULT_PERSONA } from "../data/personas.js";
import { SYSTEM_PROMPTS } from "../lib/prompts.js"; // one system prompt per persona (shared with api/*)

dotenv.config({ quiet: true });

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // gemini-2.5-pro for best fidelity
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const MAX_TOKENS = 2048;
const PORT = process.env.PORT || 8787;
const MOCK = process.env.MOCK === "1" || !API_KEY;

const client = MOCK ? null : new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

// ---------- server ----------
// Note: avatars are served as static files by the frontend (web/public/avatars),
// so both local dev (Vite) and production (Vercel) serve them without the backend.
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
