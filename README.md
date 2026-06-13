# HY Translator

Real-time speech translation for conferences and lectures — host speaks, remote viewers read in their language.

The host presses record, speaks into their microphone, and the system transcribes, translates, and streams each sentence to every viewer within roughly two seconds. Viewers open a URL or scan a QR code, pick their language, and see word-by-word captions appear as the host speaks — no app install, no account.

---

## Demo

**Live deployment:** https://speech-translate-rooms.vercel.app

> Screenshots / screen-recording to be added.

---

## Key Features

- **Real-time multi-viewer broadcast** — unlimited viewers via Ably pub/sub; host shares a QR code or URL
- **Hybrid STT pipeline** — Web Speech API provides an instant live draft while Groq Whisper transcribes the confirmed chunk in parallel, replacing the draft when the accurate result arrives
- **Three-tier translation fallback** — Google Translate (primary, 1.2 s timeout) → Groq LLaMA 3.1-8b (fallback) → GTX retry → raw source text; translation never silently disappears
- **Word-pacing queue** — chunk text is drip-fed word-by-word at 5 words/sec so the display feels like live captions rather than batch flashes
- **Per-viewer language override** — each viewer can select their own target language independently of the host's chosen language
- **RTL support** — Arabic, Hebrew, Persian, and Urdu render right-to-left automatically
- **TTS on viewer side** — optional speech synthesis reads each sentence aloud after it lands
- **Canvas video export** — record the subtitle canvas to MP4/WebM with synchronized mic audio
- **SRT/TXT transcript export** — download the session as a subtitle file or plain text log
- **Multi-room isolation** — each room gets a scoped Ably channel token; channels are namespaced and cannot cross-read

---

## Architecture

```
HOST SIDE
─────────────────────────────────────────────────────────────────────────────
Microphone
    │
    ├──► Web Speech API (browser)
    │        pause-aligned windows (300 ms silence + 1200 ms min + 3500 ms max)
    │        emits: interim text (live draft, displayed dim)
    │
    └──► useWhisperSTT  ──► POST /api/transcribe (Groq Whisper v3 Turbo)
             RMS VAD, 450 ms silence window                │
             reorder buffer (out-of-order responses)       │ key1 → key2 on 429
             MAX 7000 ms hard cap                          ▼
                                                     confirmed text
                                                           │
                                         ┌─────────────────┘
                                         ▼
                                  Translation pipeline
                                  ┌──────────────────────────────────┐
                                  │ 1. Google Translate (1.2 s limit) │  primary
                                  │ 2. Groq LLaMA 3.1-8b (3 s limit) │  fallback
                                  │ 3. GTX retry after 1 s            │  retry
                                  │ 4. raw source text                │  last resort
                                  └──────────────────────────────────┘
                                         │
                                         ▼
                                  Word-pacing queue
                                  200 ms/word base  (5 words/sec)
                                  70 ms/word catch-up (queue > 6 items)
                                         │
                           ┌─────────────┴──────────────┐
                           ▼                            ▼
                    Host subtitle display         useBroadcast
                    + optional TTS                     │
                                                       │ Ably channel
                                                       │ (room-scoped token)
                                                       │
VIEWER SIDE ───────────────────────────────────────────┘
                                                       │
                                                  subscribe
                                                       │
                                              dedup (seqId + batchId)
                                                       │
                                         optional re-translation
                                         (viewer lang ≠ host lang)
                                                       │
                                              Word-pacing queue
                                                       │
                                         ┌─────────────┴──────────────┐
                                         ▼                            ▼
                                  Live caption display          optional TTS
                                  (Spotify-style highlight,
                                   RTL-aware, font scaling)
```

**Dev mode** substitutes Ably with a local WebSocket relay (`/ws/translation`) so no Ably key is needed for local development.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| State management | Zustand |
| Styling | Tailwind CSS + Framer Motion |
| Icons | Lucide React |
| Speech recognition (draft) | Web Speech API (browser-native) |
| Speech recognition (final) | Groq Whisper v3 Turbo via `/api/transcribe` |
| Translation (primary) | Google Translate public endpoint |
| Translation (fallback) | Groq LLaMA 3.1-8b via `/api/translate` |
| Real-time transport | Ably pub/sub (production), WebSocket relay (dev) |
| Serverless functions | Vercel (Node.js + Edge Runtime) |
| Video export | `MediaRecorder` + `mp4-muxer` |
| QR generation | `qrcode` |
| Desktop wrapper | Electron (optional, Windows x64) |

---

## Engineering Decisions & Tradeoffs

### Why Ably replaced the original Redis + SSE polling approach

The first version pushed translations through a Redis-backed SSE endpoint: each viewer polled `/api/stream` every second, and each poll did a Redis `LRANGE` to fetch new items. At a single small event (40 viewers, 2-hour session), this worked fine.

The problem surfaced when estimating scale: at 200 viewers, each polling once per second, that is 200 Redis commands per second and 720,000 per hour. At Vercel KV pricing the cost for a single 2-hour event landed around **$6,000+ in Redis commands alone**, with latency still capped by the poll interval.

Switching to Ably pub/sub eliminated the polling loop entirely. The server publishes once per translated chunk; Ably fans it out to all subscribers over persistent connections. Cost for the same 2-hour event at 200 viewers: roughly **$35 flat** (Ably's message volume pricing). Latency dropped from ~1 s (poll interval) to under 100 ms (WebSocket push). The architectural change also removed the need to maintain Redis state between serverless invocations.

The tradeoff: Ably is a third-party service dependency. The dev-mode WebSocket relay (`vite.config.ts` plugin) provides a local fallback that keeps the development loop free of external services.

### Why the hybrid STT design (Web Speech + Whisper)

Browser Web Speech API starts returning interim results within 200–300 ms of the speaker's words — fast enough to feel live. The problem is accuracy: it regularly drops words, mishears proper nouns and technical terms, and the recognition session can crash silently on network blips.

Groq Whisper is substantially more accurate but has inherent latency: the audio window must close (on a natural pause), the blob must upload, Whisper must process it, and the response must arrive. End-to-end this is typically 1.5–3 s behind speech.

The hybrid design runs both engines simultaneously on the same audio:
- Web Speech interim results are displayed immediately in a dimmed style as a live draft
- When a Whisper result arrives for the same window, it atomically replaces the draft with the confirmed text, styled normally
- If Whisper is unavailable (rate-limited or API error), the system falls back to Web Speech as the sole engine and probes Whisper every 60 s for automatic recovery

This gives the viewer the feel of live captions (Web Speech speed) with the accuracy of a dedicated ASR model (Whisper quality) on the final display.

### The word-pacing queue

Translation results arrive as full chunks (one per sentence or natural pause). Displaying an entire sentence at once looks like a flash — it is visually jarring and hard to follow at normal reading pace.

The word pacer (`src/lib/wordPacer.ts`) drains each chunk word-by-word:
- Base pace: 200 ms per word (5 words/sec)
- Catch-up pace: 70 ms per word when the queue has more than 6 words pending (avoids the viewer falling far behind when Whisper delivers a long sentence)
- Returns to base pace when queue depth drops to 2 or fewer

Both the host display and the viewer display use the same pacer, so the visual rhythm is consistent. The pacer emits an `isLast` flag on the final word of a chunk so the sentence can be "frozen" (styled as confirmed) immediately when the last word drains.

### Room isolation via scoped Ably tokens

The `/api/ably-token` endpoint does not return a root API key to the client. It generates a short-lived Ably `TokenRequest` scoped to the specific room's channel (`room:{roomId}`). A viewer with a token for `room:cardiology-2025` cannot publish to or subscribe from `room:oncology-main` — the capability is enforced by Ably's auth layer, not by client-side code.

### Dual Groq key rotation

The free tier on Groq has a requests-per-minute ceiling that a single active room can reach if the speaker talks quickly. Both `/api/transcribe` and `/api/translate` accept two independent API keys (`GROQ_API_KEY_1`, `GROQ_API_KEY_2`) and rotate between them on 429 responses. The transcription endpoint also holds a rate-limited window for 2 s and retries once before declaring the window failed — this handles short bursts without triggering an engine fallback.

---

## Local Development

```bash
git clone <repo-url>
cd speech-translate-local
npm install

# Copy and fill in your keys
cp .env.example .env.local
# Edit .env.local — at minimum, set GROQ_API_KEY_1
# (Ably is only needed in prod; dev uses the built-in WebSocket relay)

npm run dev
# Host:   http://localhost:5173/
# Viewer: http://localhost:5173/viewer?room=test
```

The Vite dev server includes a WebSocket relay plugin (see `vite.config.ts`) that replaces Ably for local testing. Both tabs in the same browser on the same origin connect through this relay, so you can test host → viewer flow without an Ably account.

---

## Cost at Scale

The table below is the event that motivated the Ably migration. "Polling" is the original Redis-SSE architecture; "Pub/sub" is the current Ably architecture.

| Scenario | Viewers | Duration | Polling (Redis commands) | Pub/sub (Ably messages) |
|---|---|---|---|---|
| Small internal event | 20 | 1 h | ~72,000 cmds (~$360) | ~900 msgs (~$0.04) |
| Mid-size conference | 100 | 2 h | ~720,000 cmds (~$3,600) | ~4,500 msgs (~$0.20) |
| Large symposium | 300 | 3 h | ~3,240,000 cmds (~$16,200) | ~13,500 msgs (~$0.60) |

Costs are approximate and based on Vercel KV pricing at the time of the migration decision (Redis GET/SET at ~$0.005/1,000 commands) and Ably's standard message pricing. The Ably column does not include the monthly base fee. Real costs will vary; this table illustrates the order-of-magnitude difference in the architectural approaches.

---

## License

MIT — see [LICENSE](LICENSE).
