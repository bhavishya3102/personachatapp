// Vercel serverless function — GET /health (via rewrite, see vercel.json).

export default function handler(_req, res) {
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  res.status(200).json({
    ok: true,
    provider: "gemini (openai-compatible)",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    hasKey,
  });
}
