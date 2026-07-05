// Vercel serverless function — GET /personas (via rewrite, see vercel.json).
// Metadata the UI toggles between (no system prompts leaked).

import { PERSONAS, DEFAULT_PERSONA } from "../data/personas.js";

export default function handler(_req, res) {
  const list = Object.values(PERSONAS).map(({ id, name, brand, emoji, avatar, tagline, greeting }) => ({
    id, name, brand, emoji, tagline, greeting,
    avatar: avatar ? `/avatars/${avatar}` : null, // static file in web/public/avatars
  }));
  res.status(200).json({ personas: list, default: DEFAULT_PERSONA });
}
