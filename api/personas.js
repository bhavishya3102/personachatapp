// Vercel serverless /personas (via rewrite, see vercel.json).
// Logic lives in lib/handlers.js — shared with the local Express server.
export { handlePersonas as default } from "../lib/handlers.js";
