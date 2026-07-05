// LOCAL DEV entry point: a thin Express wrapper around the shared handlers in
// lib/handlers.js. Production (Vercel) uses those SAME handlers via the
// serverless functions in api/*.js — so /chat, /personas, /health behave
// identically in dev and prod, with the logic written exactly once.
//
// Uses the official `openai` SDK pointed at Google's OpenAI-compatible endpoint
// (see lib/handlers.js). Streams Gemini's reply token-by-token to the browser.
// Avatars are static files in web/public/avatars — served by Vite/Vercel, not here.

import express from "express";
import cors from "cors";
import { PERSONAS } from "../data/personas.js";
import { SYSTEM_PROMPTS } from "../lib/prompts.js";
import { handleChat, handlePersonas, handleHealth, MOCK, MODEL } from "../lib/handlers.js";

const PORT = process.env.PORT || 8787;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", handleHealth);
app.get("/personas", handlePersonas);
app.post("/chat", handleChat);

app.listen(PORT, () => {
  console.log(`\n🎭 Persona chat server -> http://localhost:${PORT}`);
  console.log(`   mode: ${MOCK ? "MOCK (set GEMINI_API_KEY to go live)" : "LIVE — gemini via openai-compatible (" + MODEL + ")"}`);
  for (const cfg of Object.values(PERSONAS)) {
    console.log(`   persona ${cfg.id.padEnd(7)} ${cfg.emoji}  system prompt: ${SYSTEM_PROMPTS[cfg.id].length} chars`);
  }
  console.log("");
});
