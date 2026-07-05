  // Scrapes the "Chai aur Code" YouTube channel via the YouTube Data API v3.
// Collects: recent video metadata (+ transcripts) and — most importantly —
// comment -> Hitesh's-reply pairs (the gold for persona voice).
//
// Requires YOUTUBE_API_KEY in .env.  Run:  npm run scrape:yt

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { YoutubeTranscript } from "youtube-transcript";
import { getPersona, DEFAULT_PERSONA } from "../data/personas.js";

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// which persona? `npm run scrape:yt -- piyush`  (or PERSONA=piyush)
const cfg = getPersona(process.argv[2] || process.env.PERSONA || DEFAULT_PERSONA);
const RAW_DIR = path.join(__dirname, "..", "data", cfg.dir, "raw");

const KEY = process.env.YOUTUBE_API_KEY;
const HANDLE = cfg.youtube.handle;  // youtube.com/@<handle>
const MAX_VIDEOS = Number(process.env.MAX_VIDEOS) || 40;        // recent videos to scan (max 50 without paging)
const COMMENT_PAGES = Number(process.env.COMMENT_PAGES) || 3;   // comment pages per video (100 threads each)
const SCRAPE_TRANSCRIPTS = process.env.SCRAPE_TRANSCRIPTS === "1"; // off by default (slow, unused for examples)
const API = "https://www.googleapis.com/youtube/v3";

if (!KEY) {
  console.error(
    "Missing YOUTUBE_API_KEY in .env — get one at https://console.cloud.google.com/ (enable 'YouTube Data API v3')."
  );
  process.exit(1);
}

async function api(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  url.search = new URLSearchParams({ ...params, key: KEY }).toString();
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${endpoint} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log(`Persona: ${cfg.name} — resolving channel @${HANDLE} …`);
  const ch = await api("channels", { part: "id,contentDetails,snippet", forHandle: HANDLE });
  const channel = ch.items?.[0];
  if (!channel) throw new Error(`Channel not found for handle @${HANDLE}`);

  const channelId = channel.id;
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  console.log(`Channel: ${channel.snippet.title} (${channelId})`);

  console.log(`Fetching up to ${MAX_VIDEOS} recent videos …`);
  const pl = await api("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: uploads,
    maxResults: String(MAX_VIDEOS),
  });

  const videos = [];
  const qaPairs = [];

  for (const item of pl.items || []) {
    const videoId = item.contentDetails.videoId;
    const title = item.snippet.title;
    const description = item.snippet.description || "";
    console.log(`  • ${title}`);

    // transcript (opt-in via SCRAPE_TRANSCRIPTS=1 — slow, and not used for examples.json)
    let transcript = "";
    if (SCRAPE_TRANSCRIPTS) {
      try {
        const t = await YoutubeTranscript.fetchTranscript(videoId);
        transcript = t.map((x) => x.text).join(" ");
      } catch {
        /* captions off — skip */
      }
    }
    videos.push({ videoId, title, description, transcript });

    // comment threads -> pair a viewer's comment with Hitesh's own reply (paginated)
    try {
      let pageToken;
      for (let page = 0; page < COMMENT_PAGES; page++) {
        const params = {
          part: "snippet,replies",
          videoId,
          maxResults: "100",
          order: "relevance",
          textFormat: "plainText",
        };
        if (pageToken) params.pageToken = pageToken;
        const ct = await api("commentThreads", params);
        for (const thread of ct.items || []) {
          const top = thread.snippet.topLevelComment.snippet;
          const question = (top.textDisplay || "").trim();
          const replies = thread.replies?.comments || [];
          for (const r of replies) {
            const rs = r.snippet;
            const byOwner = rs.authorChannelId?.value === channelId; // Hitesh's channel = the reply author
            if (byOwner && question && rs.textDisplay) {
              qaPairs.push({ videoId, question, answer: rs.textDisplay.trim() });
            }
          }
        }
        pageToken = ct.nextPageToken;
        if (!pageToken) break; // no more comment pages for this video
      }
    } catch (e) {
      console.warn(`    (comments skipped: ${e.message})`);
    }
  }

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const out = {
    scrapedAt: new Date().toISOString(),
    channelId,
    channelTitle: channel.snippet.title,
    videos,
    qaPairs,
  };
  const file = path.join(RAW_DIR, "youtube.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nDone (${cfg.name}). ${videos.length} videos, ${qaPairs.length} owner reply pairs -> ${file}`);
  console.log(`Next: npm run build:persona -- ${cfg.id}`);
}

main().catch((e) => {
  console.error("\nScrape failed:", e.message);
  process.exit(1);
});
