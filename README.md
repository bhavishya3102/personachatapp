# Persona Chat 🎭 — Hitesh & Piyush

A chat app that answers **in a creator's voice** — same tone, same Hinglish style, same energy.
You scrape a person's public content (YouTube comments/videos + live streams + sites), bake it
into a persona, and **OpenAI (gpt-4o-mini)** replies as them. Two personas ship out of the box and you can
**toggle** between them right in the UI:

| Persona | Voice | Channel / Site |
|---------|-------|----------------|
| ☕ **Hitesh Choudhary** — *Chai aur Code* | warm Hinglish, "Haanji", chai energy | [@chaiaurcode](https://youtube.com/@chaiaurcode) · hiteshchoudhary.com · chaicode.com |
| 👨‍💻 **Piyush Garg** | English-leaning Hinglish, practical, full-stack & GenAI | [@piyushgargdev](https://youtube.com/@piyushgargdev) · piyushgarg.dev |

**LLM:** OpenAI **`gpt-4o-mini`** via the official `openai` SDK (cheap + fast).
**No RAG, no embeddings, no vector DB.** Just: scrape → static persona context → OpenAI.

```
STEP 1 — SCRAPE            scraper/youtube.js   (videos, comments + owner replies)
   (per persona)           scraper/website.js   (their sites)
                                 |  -> data/<persona>/raw/*.json
                           scraper/live-tone.js (1 live stream -> distilled tone)
                                 |  -> data/<persona>/live-style.md   (grounding file 1 of 3)
STEP 2 — BUILD PERSONA     process/build-persona.js   (reads raw/*.json)
                                 |  -> data/<persona>/examples.json   (grounding file 2 of 3 — real reply pairs)
                                 |  -> data/<persona>/knowledge.md    (grounding file 3 of 3 — what they teach)
STEP 3 — CHAT SERVER       server/index.js   (Express + OpenAI, streamed; one prompt per persona)
                                 |  system prompt = persona.js (seed voice)
                                 |                  + knowledge.md + live-style.md + examples.json
STEP 4 — FRONTEND          web/  (React + Vite chat UI, with a persona toggle)

Grounding files that get generated: live-style.md (STEP 1), examples.json + knowledge.md (STEP 2).
data/<persona>/persona.js is the hand-written seed voice — an INPUT you tune, not generated.
```

Everything is wired through one registry — **`data/personas.js`**. Add a persona there and the
scrapers, build step, server, and UI all pick it up automatically.

The "intelligence" is: **good scrape → good persona context → OpenAI does the voice.**
`data/<persona>/persona.js` (their tone/rules) is the single biggest lever — tune it freely.

---

## Setup

```bash
# 1. install backend deps
npm install

# 2. install frontend deps
npm run web:install

# 3. add your keys
cp .env.example .env
#    then edit .env — see "Keys" below
```

### Keys

| Key | Needed for | Get it |
|-----|-----------|--------|
| `OPENAI_API_KEY` | real chat replies + live-tone distill | https://platform.openai.com/api-keys  (paid) |
| `YOUTUBE_API_KEY`   | scraping YT comments/videos | https://console.cloud.google.com/ (enable *YouTube Data API v3*) |

> Model defaults to `gpt-4o-mini` (cheap + fast). Override with `OPENAI_MODEL` in `.env`.

**No OpenAI key yet?** No problem — the server runs in **MOCK mode** and the UI works with a
canned reply, so you can build the frontend first. Add the key later to go live.

---

## Run

Two terminals:

```bash
# terminal 1 — backend  (http://localhost:8787)
npm run dev

# terminal 2 — frontend (http://localhost:5173)
npm run web
```

Open **http://localhost:5173**, use the **toggle in the top-right** to pick a persona, and chat.
Each persona keeps its **own** conversation, so switching back and forth never loses history.
The Vite dev server proxies `/chat`, `/health`, and `/personas` to the backend; avatars are static
files in `web/public/avatars/`.

---

## Deploy to Vercel

The app ships ready for Vercel — the frontend is static and the backend runs as **serverless
functions** in `api/` (which stream OpenAI's reply, same as local). `vercel.json` wires it all up.

```bash
# 1. push to GitHub  (already a git repo — add a remote, commit, push)
git add -A && git commit -m "persona chat" && git push

# 2. on vercel.com -> New Project -> import this repo.
#    Vercel reads vercel.json automatically — no build settings to change.

# 3. Project -> Settings -> Environment Variables:
#       OPENAI_API_KEY = <your key>          (required)
#       OPENAI_MODEL   = gpt-4o-mini         (optional; this is the default)

# 4. Deploy. Done — one URL serves the UI + /chat + /personas.
```

> Prefer the CLI? `npm i -g vercel` then `vercel` (preview) / `vercel --prod`.
> `YOUTUBE_API_KEY` is **not** needed on Vercel — it's only for scraping locally.
> The scrape/build steps run on your machine; commit the generated `data/<persona>/` files so
> they ship with the deploy (`data/raw/` is gitignored and not needed at runtime).

**How it maps:** `web/dist` → static site · `/chat`,`/personas`,`/health` → `api/*` functions
(via `rewrites`) · `data/**` is bundled into the functions (`includeFiles`) so prompts load at runtime.

---

## Make it sound like the *real* person (enrich a persona)

Out of the box each persona uses **seed** examples/knowledge. To ground it in their actual replies
and live-stream tone, run the pipeline **for a persona** (pass the id after `--`):

```bash
# --- Piyush (default id if omitted is "hitesh") ---
npm run scrape:yt   -- piyush   # needs YOUTUBE_API_KEY — videos + owner comment replies
npm run scrape:web  -- piyush   # text from their site(s)
npm run scrape:live -- piyush   # 1 live stream -> distilled "live tone" note (needs OPENAI_API_KEY)
npm run build:persona -- piyush # raw/* -> examples.json + knowledge.md
npm run dev                     # restart to load the new persona context

# --- Hitesh (same, with "hitesh" or no arg) ---
npm run scrape:yt   -- hitesh
```

`scrape:yt` gets their **own replies to comments** ("how they answer"); `scrape:live` distills a
live stream into a compact tone note (openings, signature phrases, how they treat the audience) —
we distill instead of dumping the raw transcript so it stays cheap per message.

> Override the live-stream video: `LIVE_VIDEO_ID=<id> npm run scrape:live -- piyush`
> (default is set per persona in `data/personas.js`).

---

## Add a new persona

1. Create `data/<id>/persona.js` exporting `PERSONA` (their voice — copy an existing one as a template).
2. Add an entry to **`data/personas.js`** (name, emoji, greeting, `youtube.handle`, `youtube.liveVideoId`, `website`).
3. Scrape + build for that id (the four commands above).
4. Restart the server. The toggle shows the new persona automatically.

---

## Files

```
data/personas.js          # registry: all personas + their config (the wiring hub)
data/<persona>/persona.js # their voice + rules  (seed system prompt — edit to tune tone)
data/<persona>/knowledge.md   # what they teach  (regenerated by build:persona)
data/<persona>/examples.json  # real reply pairs (regenerated by build:persona)
data/<persona>/live-style.md  # distilled live-stream tone (from scrape:live)
data/<persona>/raw/*.json     # raw scraped data (gitignored; dev-only)
lib/prompts.js            # builds one system prompt per persona (shared: local server + serverless)
scraper/youtube.js        # YouTube Data API v3 scraper (persona-aware)
scraper/website.js        # cheerio site scraper (persona-aware)
scraper/live-tone.js      # live-stream transcript -> distilled tone (persona-aware)
process/build-persona.js  # raw/* -> examples.json + knowledge.md
server/index.js           # LOCAL dev: Express + OpenAI streaming (uses lib/prompts.js)
api/chat.js               # PROD: Vercel serverless /chat (streams; uses lib/prompts.js)
api/personas.js           # PROD: Vercel serverless /personas   ·   api/health.js -> /health
vercel.json               # Vercel build + rewrites (/chat->/api/chat) + bundles data/**
web/                      # React + Vite chat UI with persona toggle
web/public/avatars/*      # persona photos (served statically at /avatars/<file>)
```

Both `server/index.js` (local) and `api/*.js` (Vercel) share the same persona logic via
`lib/prompts.js` + `data/personas.js` — so replies are identical in dev and production.

## Notes / tweaks

- **Model:** defaults to `gpt-4o-mini` (cheap + fast). Set `OPENAI_MODEL` in `.env` to any other
  OpenAI chat model (e.g. `gpt-4o`) for higher fidelity. All LLM logic lives in `lib/handlers.js`.
- **Cost:** the whole system prompt (persona + knowledge + live-style + examples) is sent on every
  message. The server only sends the **last 10 turns** of history to keep long chats cheap
  (`lib/handlers.js`). Live-stream tone is *distilled* (~500 tokens) rather than raw (~6k+).
- **JS-heavy sites:** if `scrape:web` returns little text, the site is a JavaScript SPA — swap
  `scraper/website.js` to Puppeteer (render, then read). (piyushgarg.dev is an SPA, so its scrape is thin.)
- **Ethics/ToS:** scraping uses the official YouTube API; keep this for personal/educational use.
  This mimics real people's public style — keep it respectful and for learning.
```
