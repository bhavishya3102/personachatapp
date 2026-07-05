// Scrapes text from Hitesh's sites for grounding knowledge (what he teaches).
// Simple + polite: fetch a few pages, extract visible text with cheerio.
//
// Run:  npm run scrape:web
//
// NOTE: if a site is a heavy JavaScript SPA, plain fetch may return little text.
// In that case switch this file to Puppeteer (render then read). For most
// grounding needs the static HTML is enough.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { getPersona, DEFAULT_PERSONA } from "../data/personas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// which persona? `npm run scrape:web -- piyush`  (or PERSONA=piyush)
const cfg = getPersona(process.argv[2] || process.env.PERSONA || DEFAULT_PERSONA);
const RAW_DIR = path.join(__dirname, "..", "data", cfg.dir, "raw");

const URLS = cfg.website;

function extractText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const title = $("title").first().text().trim();

  const parts = [];
  $("h1, h2, h3, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length > 2) parts.push(t);
  });

  const seen = new Set();
  const text = parts.filter((t) => (seen.has(t) ? false : seen.add(t))).join("\n");
  return { title, text: text.slice(0, 8000) };
}

async function main() {
  const pages = [];
  for (const url of URLS) {
    try {
      console.log(`Fetching ${url} …`);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (persona-chat scraper; educational)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { title, text } = extractText(html);
      pages.push({ url, title, text });
      console.log(`  ok — ${text.length} chars`);
    } catch (e) {
      console.warn(`  skipped ${url}: ${e.message}`);
    }
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const file = path.join(RAW_DIR, "website.json");
  fs.writeFileSync(file, JSON.stringify({ scrapedAt: new Date().toISOString(), pages }, null, 2));
  console.log(`\nDone (${cfg.name}). ${pages.length} pages -> ${file}`);
  console.log(`Next: npm run build:persona -- ${cfg.id}`);
}

main().catch((e) => {
  console.error("Scrape failed:", e.message);
  process.exit(1);
});
