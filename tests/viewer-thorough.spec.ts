/**
 * Thorough viewer test — 8 sentences, 3 s gaps.
 * Tests: connection, sentence receipt, accumulation, TTS correctness, TTS liveness.
 */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE          = "https://speech-translate-local-peach.vercel.app";
const BROADCAST_URL = `${BASE}/api/broadcast`;
const SS_DIR        = path.join(__dirname, "screenshots-thorough");

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

const SENTENCES = [
  "Good morning and welcome to the conference",
  "Today we discuss cardiovascular surgery",
  "The trial included four thousand patients",
  "Results showed significant mortality reduction",
  "Secondary outcomes favored the endoscopic approach",
  "Lower stroke rates and shorter ICU stays",
  "We recommend adoption of this technique",
  "Thank you for attending today",
];

// TTS spy: wraps SpeechSynthesisUtterance constructor (a plain window property,
// unlike speechSynthesis.speak which is non-writable in headless Chrome).
// Each utterance creation is logged; onend is intercepted to fire after 50 ms
// so the ViewerPage drain queue never stalls waiting for real TTS engines.
const TTS_MOCK_SCRIPT = `
(function() {
  window.__ttsLog      = [];
  window.__appearTs    = {};
  window.__ttsInitErr  = null;

  // ── Patch TTS FIRST (no DOM needed) ─────────────────────────────────────────
  // Strategy 1: patch SpeechSynthesis.prototype.speak via Object.defineProperty.
  // This survives even if the constructor reference is pre-cached by the bundle.
  try {
    var _proto = window.SpeechSynthesis && SpeechSynthesis.prototype;
    var _origSpeak = _proto && _proto.speak;
    if (!_origSpeak) throw new Error("SpeechSynthesis.prototype.speak not found");
    Object.defineProperty(_proto, "speak", {
      configurable: true,
      value: function(utter) {
        window.__ttsLog.push({ text: (utter && utter.text) || "", ts: Date.now() });
        // Re-read onend after 50 ms in case the caller sets it after speak()
        setTimeout(function() {
          var fn = utter && utter.onend;
          if (typeof fn === "function") {
            try { fn(new Event("end")); } catch(e2) {}
          }
        }, 50);
        try { _origSpeak.call(this, utter); } catch(e) {}
      }
    });
    window.__ttsPatchMode = "speak-proto";
  } catch(e1) {
    window.__ttsInitErr = "speak-patch: " + (e1 && e1.message);
    // Strategy 2: wrap SpeechSynthesisUtterance constructor
    try {
      var OrigUtter = window.SpeechSynthesisUtterance;
      if (typeof OrigUtter !== "function") throw new Error("SSU not a function");
      function PatchedUtter(text) {
        window.__ttsLog.push({ text: text || "", ts: Date.now() });
        var u = new OrigUtter(text || "");
        var _endTimer = null;
        try {
          Object.defineProperty(u, "onend", {
            get: function() { return u.__onend__; },
            set: function(fn) {
              clearTimeout(_endTimer);
              u.__onend__ = fn;
              if (fn) _endTimer = setTimeout(function() {
                if (u.__onend__) u.__onend__(new Event("end"));
              }, 50);
            },
            configurable: true
          });
        } catch(e) { /* onend not configurable on this utterance, skip */ }
        return u;
      }
      PatchedUtter.prototype = OrigUtter.prototype;
      window.SpeechSynthesisUtterance = PatchedUtter;
      window.__ttsPatchMode = "ctor";
      window.__ttsInitErr = null;
    } catch(e2) {
      window.__ttsInitErr = "ctor-patch: " + (e2 && e2.message);
      window.__ttsPatchMode = "none";
    }
  }

  // ── MutationObserver: record when each sentence prefix appears in DOM ────────
  // Deferred so the DOM is ready — do NOT call observer.observe() before the
  // document element exists or it throws and kills the whole init script.
  function attachObserver() {
    var root = document.documentElement || document.body;
    if (!root) return;
    var observer = new MutationObserver(function() {
      if (!window.__watchSentences) return;
      var body = document.body ? document.body.innerText : "";
      window.__watchSentences.forEach(function(prefix) {
        if (!window.__appearTs[prefix] && body.includes(prefix)) {
          window.__appearTs[prefix] = Date.now();
        }
      });
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachObserver);
  } else {
    attachObserver();
  }
})();
`;

// ── helpers ───────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
  const file = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function injectSentence(chunk: string, batchId: string) {
  const res = await fetch(BROADCAST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type:       "translation",
      chunk,
      targetLang: "ar",
      isFinal:    true,
      batchId,
      transcript: chunk,
      sourceLang: "en",
      text:       chunk,
    }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`Broadcast failed: ${JSON.stringify(data)}`);
}

// ── main test ─────────────────────────────────────────────────────────────────

test.describe("Viewer 8-sentence thorough test", () => {
  test("drop / accumulation / tts / liveness", async ({ page }) => {
    const BATCH_ID = `thorough-${Date.now()}`;

    // Install TTS mock before page loads
    await page.addInitScript(TTS_MOCK_SCRIPT);

    // Register sentence prefixes for appearance tracking
    const prefixes = SENTENCES.map(s => s.slice(0, 22));
    await page.addInitScript(`window.__watchSentences = ${JSON.stringify(prefixes)};`);

    // ── Open viewer ────────────────────────────────────────────────────────────
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await ss(page, "00-initial");

    // Unlock audio: the overlay covers the entire viewport (fixed inset-0 z-50).
    // Clicking by coordinates is more reliable than targeting a child text element.
    const tapOverlay = page.locator("text=Tap to start");
    if (await tapOverlay.isVisible({ timeout: 4000 }).catch(() => false)) {
      // Click the center of the viewport — guaranteed to hit the full-screen overlay
      await page.mouse.click(640, 360);
      // Wait until the overlay disappears (audioUnlocked = true commits to DOM)
      await page.waitForFunction(
        () => !document.body.innerText.includes("Tap to start"),
        { timeout: 3000 }
      ).catch(() => {
        // Fallback: try evaluate click on the overlay div
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('[class*="z-50"]');
          el?.click();
        });
      });
      await page.waitForTimeout(200);
    }
    const audioUnlocked = !(await page.locator("text=Tap to start").isVisible({ timeout: 500 }).catch(() => false));
    console.log(`  AUDIO UNLOCK: ${audioUnlocked ? "✅ unlocked" : "❌ still locked"}`);
    await ss(page, "01-unlocked");

    // ── CONNECTION TEST ────────────────────────────────────────────────────────
    let connected = false;
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("Connected"),
        { timeout: 6000 }
      );
      connected = true;
    } catch {
      connected = false;
    }
    console.log(`\n  CONNECTION: ${connected ? "✅ Connected" : "❌ Connecting (still)"}`);
    await ss(page, "02-connection-status");

    // ── 8-SENTENCE INJECTION ───────────────────────────────────────────────────
    // Reset __appearTs so stale DOM text (e.g. cached Redis seed message from a prior run)
    // doesn't produce false-early appearance timestamps.
    await page.evaluate(() => { (window as any).__appearTs = {}; });

    // Record node-side inject time; compare with browser-side appearance time via __appearTs
    const injectNodeTs: number[] = [];
    const appearNodeTs: number[] = new Array(SENTENCES.length).fill(0);
    const receivedMask: boolean[] = new Array(SENTENCES.length).fill(false);
    const droppedNums: number[] = [];

    for (let i = 0; i < SENTENCES.length; i++) {
      const sentence = SENTENCES[i];
      const prefix   = sentence.slice(0, 22);
      const loopStart = Date.now();

      injectNodeTs[i] = Date.now();
      await injectSentence(sentence, BATCH_ID);
      console.log(`  [${i + 1}/8] Injected: "${sentence.slice(0, 45)}"`);

      // Wait up to 6 s for the sentence to appear (first sentence gets 8 s)
      const timeout = i === 0 ? 8000 : 6000;
      try {
        await page.waitForFunction(
          (pfx) => document.body.innerText.includes(pfx),
          prefix,
          { timeout }
        );
        receivedMask[i] = true;
        appearNodeTs[i] = Date.now(); // Node.js-side timestamp avoids browser __appearTs stale-read issues
        const elapsed = appearNodeTs[i] - injectNodeTs[i];
        console.log(`      → appeared ~${elapsed}ms after inject`);
      } catch {
        droppedNums.push(i + 1);
        console.log(`      → ❌ NOT received (timeout ${timeout}ms)`);
      }

      await ss(page, `sentence-${String(i + 1).padStart(2, "0")}`);

      // Maintain 3 s gap between sentences
      if (i < SENTENCES.length - 1) {
        const wait = Math.max(0, 3000 - (Date.now() - loopStart));
        if (wait > 0) await page.waitForTimeout(wait);
      }
    }

    // Let final renders settle
    await page.waitForTimeout(1500);
    await ss(page, "09-final-state");

    // ── ACCUMULATION CHECK ─────────────────────────────────────────────────────
    const bodyText    = await page.evaluate(() => document.body.innerText);
    const visibleNums = SENTENCES.map((s, i) => bodyText.includes(s.slice(0, 22)) ? i + 1 : null).filter(Boolean);
    const accumulationOk = visibleNums.length === receivedMask.filter(Boolean).length;

    console.log(`\n  ══ ACCUMULATION ══`);
    console.log(`  Visible: ${visibleNums.length}/8 — sentences ${visibleNums.join(", ")}`);

    // ── TTS ANALYSIS ───────────────────────────────────────────────────────────
    interface TtsEntry { text: string; ts: number }
    const ttsLog: TtsEntry[] = await page.evaluate(() => (window as any).__ttsLog ?? []);
    const appearTs: Record<string, number> = await page.evaluate(() => (window as any).__appearTs ?? {});

    // Map sentence → TTS call
    const ttsByIdx = SENTENCES.map(s => ttsLog.find(t => t.text.includes(s.slice(0, 15))) ?? null);
    const ttsSpokenNums = ttsByIdx.map((v, i) => v ? i + 1 : null).filter(Boolean) as number[];
    const ttsSkippedNums = ttsByIdx.map((v, i) => (!v && receivedMask[i]) ? i + 1 : null).filter(Boolean);
    const textCounts: Record<string, number> = {};
    ttsLog.forEach(t => { textCounts[t.text] = (textCounts[t.text] ?? 0) + 1; });
    const ttsRepeats = Object.entries(textCounts).filter(([, c]) => c > 1);

    // Liveness: sentences 2–8 only.
    // Use Node.js-side appearNodeTs (recorded when waitForFunction resolved) rather than
    // browser-side __appearTs which can be polluted by stale Redis-cached content that
    // causes "Thank you for attending today" to appear in the DOM before it's injected.
    const liveness: number[] = [];
    console.log(`\n  ── Per-sentence liveness ──`);
    for (let i = 1; i < SENTENCES.length; i++) {
      if (!receivedMask[i] || !ttsByIdx[i]) continue;
      const aTs = appearNodeTs[i]; // Node.js timestamp when sentence appeared in DOM
      const tTs = ttsByIdx[i]!.ts; // Browser timestamp when TTS was called
      const diff = aTs ? tTs - aTs : null;
      console.log(`  [${i+1}] appearNode=${aTs} tTs=${tTs} diff=${diff ?? "??"}`);
      if (aTs && tTs >= aTs) liveness.push(tTs - aTs);
      else if (aTs) liveness.push(0); // TTS fired before or at same time as appearance — treat as 0 delay
    }
    const avgLiveness = liveness.length > 0
      ? Math.round(liveness.reduce((a, b) => a + b, 0) / liveness.length)
      : null;

    // TTS cuts: check if any tts text is shorter than the sentence (truncated mid-word)
    const ttsCuts = SENTENCES.map((s, i) => {
      if (!ttsByIdx[i]) return false;
      const spoken = ttsByIdx[i]!.text;
      return spoken.length < s.length - 2; // more than 2 chars shorter = cut
    }).map((v, i) => v ? i + 1 : null).filter(Boolean);

    // ── FINAL REPORT ───────────────────────────────────────────────────────────
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║        8-SENTENCE TEST REPORT        ║`);
    console.log(`  ╚══════════════════════════════════════╝`);
    console.log(`  Sentences received  : ${receivedMask.filter(Boolean).length}/8${droppedNums.length ? "  ← dropped: " + droppedNums.join(",") : ""}`);
    console.log(`  Accumulation        : ${accumulationOk ? "✅ working" : "❌ broken"} (${visibleNums.length} visible)`);
    console.log(`  TTS speaking        : ${ttsLog.length > 0 ? "✅ yes (" + ttsLog.length + " calls)" : "❌ no"}`);
    console.log(`  TTS spoken sentences: ${ttsSpokenNums.join(", ") || "none"}`);
    console.log(`  TTS repeats         : ${ttsRepeats.length > 0 ? "❌ " + ttsRepeats.map(([t, c]) => `"${t.slice(0,20)}"×${c}`).join("; ") : "✅ none"}`);
    console.log(`  TTS skips           : ${ttsSkippedNums.length > 0 ? "❌ sentences " + ttsSkippedNums.join(",") : "✅ none"}`);
    console.log(`  TTS cuts            : ${ttsCuts.length > 0 ? "❌ sentences " + ttsCuts.join(",") : "✅ none"}`);
    console.log(`  TTS liveness (2–8)  : ${avgLiveness !== null ? avgLiveness + "ms avg" : "n/a"} ${avgLiveness !== null && avgLiveness < 300 ? "✅" : avgLiveness !== null ? "❌ >300ms" : ""}`);
    console.log(`  Connection          : ${connected ? "✅ stable" : "❌ not connected"}`);

    // ── ASSERTIONS ─────────────────────────────────────────────────────────────
    expect(connected, "Viewer must show Connected").toBe(true);
    expect(droppedNums, `Dropped sentences: ${droppedNums}`).toHaveLength(0);
    expect(accumulationOk, "All received sentences must accumulate on screen").toBe(true);
    expect(ttsLog.length, "TTS must have been called at least once").toBeGreaterThan(0);
    expect(ttsSkippedNums, `TTS skipped sentences: ${ttsSkippedNums}`).toHaveLength(0);
    expect(ttsRepeats, `TTS repeated: ${ttsRepeats.map(([t]) => t.slice(0,20)).join(",")}`).toHaveLength(0);
    expect(ttsCuts, `TTS cut sentences: ${ttsCuts}`).toHaveLength(0);
    if (avgLiveness !== null) {
      expect(avgLiveness, `TTS liveness ${avgLiveness}ms > 300ms`).toBeLessThan(300);
    }
  });
});
