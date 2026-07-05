import { useState, useRef, useEffect } from "react";

// Fallback if /personas can't be reached (e.g. backend down) — keeps the UI usable.
const FALLBACK = [
  {
    id: "hitesh",
    name: "Hitesh Choudhary",
    brand: "Chai aur Code",
    emoji: "☕",
    avatar: null,
    tagline: "Hitesh persona — pooch lijiye koi bhi coding doubt",
    greeting: "Haanji! ☕ Chai aur Code mein aapka swagat hai. Koi bhi coding doubt poochh lijiye. 🔥",
  },
];

// Persona face: real photo if we have one, otherwise the text emoji.
function Face({ p, className }) {
  if (p?.avatar) return <img className={className} src={p.avatar} alt={p.name} />;
  return <span className={className}>{p?.emoji}</span>;
}

export default function App() {
  const [personas, setPersonas] = useState(FALLBACK);
  const [activeId, setActiveId] = useState(FALLBACK[0].id);
  // each persona keeps its OWN chat history, so switching never loses a conversation
  const [chats, setChats] = useState({
    [FALLBACK[0].id]: [{ role: "assistant", content: FALLBACK[0].greeting }],
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const active = personas.find((p) => p.id === activeId) || personas[0];
  const messages = chats[activeId] || [];

  // update only one persona's history (leaves the others untouched)
  function updateChat(pid, updater) {
    setChats((prev) => ({ ...prev, [pid]: updater(prev[pid] || []) }));
  }

  // load the persona list from the backend once
  useEffect(() => {
    fetch("/personas")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data?.personas) || !data.personas.length) return;
        setPersonas(data.personas);
        const first = data.default || data.personas[0].id;
        setActiveId(first);
        // seed every persona with its own greeting = separate, persistent histories
        const seeded = {};
        for (const p of data.personas) seeded[p.id] = [{ role: "assistant", content: p.greeting }];
        setChats(seeded);
      })
      .catch(() => {/* keep fallback */});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  // switch persona: just change the view — keep each persona's history intact
  function switchPersona(id) {
    if (id === activeId || busy) return;
    setActiveId(id);
    setInput("");
    setChats((prev) => {
      if (prev[id]) return prev; // already has history — leave it
      const p = personas.find((x) => x.id === id);
      return { ...prev, [id]: [{ role: "assistant", content: p?.greeting || "" }] };
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const pid = activeId; // lock this send to the current persona (switching is disabled while busy)

    const history = [...(chats[pid] || []), { role: "user", content: text }];
    updateChat(pid, () => [...history, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const payload = history.filter((m) => m.role === "user" || m.role === "assistant");
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: pid, messages: payload }),
      });
      if (!res.ok || !res.body) throw new Error("request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        updateChat(pid, (prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch {
      updateChat(pid, (prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: "Arre, connection mein dikkat aa gayi. Server chalu hai kya? (npm run dev)",
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Face p={active} className="cup" />
          <div>
            <h1>{active.brand}</h1>
            <p>{active.tagline}</p>
          </div>
        </div>

        {personas.length > 1 && (
          <div className="persona-toggle" role="tablist" aria-label="Choose persona">
            {personas.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === activeId}
                className={`persona-btn ${p.id === activeId ? "on" : ""}`}
                onClick={() => switchPersona(p.id)}
                disabled={busy}
                title={busy ? "Wait for the reply to finish" : `Switch to ${p.name}`}
              >
                <Face p={p} className="pe" />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="chat" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className="avatar">
              {m.role === "assistant" ? <Face p={active} className="avatar-face" /> : "🙋"}
            </div>
            <div className="bubble">{m.content || <span className="typing">…</span>}</div>
          </div>
        ))}
      </main>

      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={`${active.name} se apna sawaal poochiye…  (Enter to send)`}
          rows={1}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "Bhejo"}
        </button>
      </footer>
    </div>
  );
}
