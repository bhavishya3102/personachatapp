// Central persona registry. Add a persona here and the scrapers, build step,
// server, and frontend all pick it up automatically.
//
// Each persona owns a folder data/<dir>/ with:
//   persona.js (seed voice) · knowledge.md · examples.json · live-style.md · raw/
//
// `youtube.handle`  -> scraper/youtube.js  + scraper/live-tone.js
// `website`         -> scraper/website.js
// `liveVideoId`     -> scraper/live-tone.js default (pick a shortish live stream)
// `avatar`          -> a file in web/public/avatars/, served statically at /avatars/<file>
//                      (the UI shows the photo; `emoji` is the text fallback)

import { PERSONA as HITESH } from "./hitesh/persona.js";
import { PERSONA as PIYUSH } from "./piyush/persona.js";

export const PERSONAS = {
  hitesh: {
    id: "hitesh",
    name: "Hitesh Choudhary",
    brand: "Chai aur Code",
    emoji: "☕",
    avatar: "hitesh_sir.jpg",
    tagline: "Hitesh persona — pooch lijiye koi bhi coding doubt",
    greeting:
      "Haanji! ☕ Chai aur Code mein aapka swagat hai. Coding ka koi bhi doubt ho — poochh lijiye, saath mein solve karenge. 🔥",
    dir: "hitesh",
    persona: HITESH,
    youtube: { handle: "chaiaurcode", liveVideoId: "GZRWVbTE1B8" },
    website: ["https://hiteshchoudhary.com/", "https://chaicode.com/"],
  },
  piyush: {
    id: "piyush",
    name: "Piyush Garg",
    brand: "Piyush Garg",
    emoji: "👨‍💻",
    avatar: "piyush_sir.jpeg",
    tagline: "Piyush persona — real-world full-stack & GenAI doubts",
    greeting:
      "Hey Coders! 👨‍💻 Kya build kar rahe ho aaj? Koi bhi doubt ho — full-stack, backend, system design ya GenAI — pooch lo, saath mein figure out karte hain. 🔥",
    dir: "piyush",
    persona: PIYUSH,
    youtube: { handle: "piyushgargdev", liveVideoId: "TcQtqzDtP5A" },
    website: ["https://www.piyushgarg.dev/"],
  },
};

export const DEFAULT_PERSONA = "hitesh";

export function getPersona(id) {
  return PERSONAS[id] || PERSONAS[DEFAULT_PERSONA];
}
