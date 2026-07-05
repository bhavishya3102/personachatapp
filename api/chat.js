// Vercel serverless /chat (via rewrite from /chat, see vercel.json).
// Logic lives in lib/handlers.js — shared with the local Express server.
export { handleChat as default } from "../lib/handlers.js";

// allow the stream up to 60s (Vercel Hobby default is 10s)
export const config = { maxDuration: 60 };
