// Vercel serverless /health (via rewrite, see vercel.json).
// Logic lives in lib/handlers.js — shared with the local Express server.
export { handleHealth as default } from "../lib/handlers.js";
