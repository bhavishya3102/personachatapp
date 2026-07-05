// Shared HTTP handlers for the persona chat backend — the single source of truth
// for /chat, /personas, /health. Used by BOTH:
//   • the local Express server (server/index.js)
//   • the Vercel serverless functions (api/*.js)
// Express and Vercel expose the same (req, res) surface we rely on
// (req.body / req.method · res.status().json() · res.setHeader / write / end),
// so one handler runs unchanged in both.

import dotenv from "dotenv";
import OpenAI from "openai";
import { PERSONAS, getPersona, DEFAULT_PERSONA } from "../data/personas.js";
import { SYSTEM_PROMPTS } from "./prompts.js";

dotenv.config({ quiet: true }); // loads .env locally; no-op on Vercel (env is injected)

export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // gemini-2.5-pro for best fidelity
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const MAX_TOKENS = 2048;
export const MOCK = process.env.MOCK === "1" || !API_KEY; // no key -> canned reply so the UI still works

const client = MOCK ? null : new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

export function handleHealth(_req, res) {
  res.status(200).json({ ok: true, mock: MOCK, provider: "gemini (openai-compatible)", model: MODEL, hasKey: !!API_KEY });
}

// personas the UI can toggle between (metadata only — no prompts leaked)
export function handlePersonas(_req, res) {
  const list = Object.values(PERSONAS).map(({ id, name, brand, emoji, avatar, tagline, greeting }) => ({
    id, name, brand, emoji, tagline, greeting,
    avatar: avatar ? `/avatars/${avatar}` : null, // static file in web/public/avatars
  }));
  res.status(200).json({ personas: list, default: DEFAULT_PERSONA });
}

export async function handleChat(req, res) {
  if (req.method && req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

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
  res.setHeader("Cache-Control", "no-cache, no-transform"); // no-transform keeps hosts from buffering the stream

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
}

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
