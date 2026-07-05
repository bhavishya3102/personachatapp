// Vercel serverless function — POST /chat (via rewrite from /chat, see vercel.json).
// Streams Gemini's reply token-by-token, same as the local Express server.
// Shares persona + prompt logic with server/index.js through ../lib/prompts.js.

import OpenAI from "openai";
import { getPersona } from "../data/personas.js";
import { SYSTEM_PROMPTS } from "../lib/prompts.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const MAX_TOKENS = 2048;

// allow the stream up to 60s (Vercel Hobby default is 10s)
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  if (!API_KEY) {
    res.status(500).json({ error: "GEMINI_API_KEY is not set in the environment." });
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
  res.setHeader("Cache-Control", "no-cache, no-transform"); // no-transform keeps Vercel from buffering the stream

  const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
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
    res.write("\n\n[arre, ek chhoti si dikkat aa gayi — thodi der baad try kijiye. (server error)]");
    res.end();
  }
}
