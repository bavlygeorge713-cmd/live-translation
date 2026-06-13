/**
 * TTS Benchmark: 1-minute fast-speech simulation against 4 TTS setups.
 *
 * Injects 8 sentences at 3-second intervals (≈180 wpm delivery rate) via
 * /api/broadcast and spies on window.speechSynthesis to measure:
 *  - speak call count and cancel count
 *  - text spoken per call (words)
 *  - whether any sentence was dropped
 *  - whether old sentences are repeated
 *
 * Run: npx playwright test tests/tts-benchmark.spec.ts --project=desktop
 */

import { test, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = "https://speech-translate-local-peach.vercel.app";
const BROADCAST_URL = `${BASE}/api/broadcast`;
const SS_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

const SENTENCES = [
  "Good morning everyone and welcome to the International Medical Conference on Cardiovascular Surgery.",
  "Today we will discuss the latest advancements in minimally invasive cardiac procedures including transcatheter aortic valve replacement and robotic assisted coronary artery bypass grafting.",
  "Our first speaker will present findings from a multicenter randomized controlled trial involving four thousand two hundred patients across seventeen hospitals in nine countries.",
  "The primary endpoint was thirty day mortality and secondary endpoints included stroke rate myocardial infarction rehospitalization and quality of life measures at six months and one year follow up.",
  "Patients were randomized one to one to receive either the standard surgical approach or the novel endoscopic technique.",
  "Results showed a statistically significant reduction in thirty day mortality from four point two percent in the surgical group to one point eight percent with a p value of less than zero point zero zero one.",
  "Secondary outcomes also favored the endoscopic approach with lower stroke rates shorter intensive care unit stays and faster return to normal activity.",
  "We believe these findings support adoption of the endoscopic technique as the new standard of care for high risk patients requiring aortic valve replacement and robotic coronary artery bypass grafting procedures.",
];

interface TtsEvent { type: "speak" | "cancel"; text?: string; t: number; }

interface SetupResult {
  setup: string;
  speakCount: number;
  cancelCount: number;
  avgWordsPerSpeak: number;
  sentencesDropped: number;
  sentencesRepeated: number;
  firstSpeakDelay: number; // ms from first sentence broadcast to first speak
  naturalScore: number;    // heuristic 1-10
  keptUp: boolean;         // last speak within 10 s of last sentence
  pass: boolean;
}

async function broadcastFinal(text: string, batchId: string) {
  await fetch(BROADCAST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "translation",
      chunk: text,
      transcript: text,
      targetLang: "en",
      sourceLang: "en",
      isFinal: true,
      batchId,
    }),
  });
}

async function ss(page: Page, name: string) {
  const file = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function unlockViewer(page: Page) {
  const overlay = page.locator("text=Tap to start");
  if (await overlay.isVisible({ timeout: 5000 }).catch(() => false)) {
    await overlay.click();
    await page.waitForTimeout(400);
  }
}

async function runSetup(
  page: Page,
  setup: "A" | "B" | "C" | "D",
): Promise<SetupResult> {
  const batchId = `bench-${setup}-${Date.now()}`;

  await page.addInitScript(() => {
    (window as any).__ttsLog = [] as TtsEvent[];
    const origSpeak  = window.speechSynthesis.speak.bind(window.speechSynthesis);
    const origCancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      ((window as any).__ttsLog as TtsEvent[]).push({ type: "speak", text: u.text, t: Date.now() });
      origSpeak(u);
    };
    window.speechSynthesis.cancel = () => {
      ((window as any).__ttsLog as TtsEvent[]).push({ type: "cancel", t: Date.now() });
      origCancel();
    };
  });

  await page.goto(`${BASE}/viewer?ttsSetup=${setup}`, { waitUntil: "networkidle" });
  await unlockViewer(page);
  await page.waitForTimeout(800);

  // Force viewer language to "en" via localStorage then reload
  await page.evaluate(() => {
    localStorage.setItem("ct_viewer_lang", "en");
    localStorage.setItem("ct_viewer_lang_manual", "true");
  });
  await page.reload({ waitUntil: "networkidle" });
  await unlockViewer(page);
  await page.waitForTimeout(800);

  const t0 = Date.now();
  const sentenceTimes: number[] = [];

  // Send 8 sentences at 3-second intervals
  for (let i = 0; i < SENTENCES.length; i++) {
    sentenceTimes.push(Date.now() - t0);
    await broadcastFinal(SENTENCES[i], batchId);

    // Screenshots at 15s, 30s, 45s, 60s marks
    const elapsed = Date.now() - t0;
    if (i === 4) await ss(page, `bench-${setup}-t${Math.round(elapsed / 1000)}s`);

    if (i < SENTENCES.length - 1) await page.waitForTimeout(3000);
  }

  await ss(page, `bench-${setup}-t${Math.round((Date.now() - t0) / 1000)}s-final`);
  // Wait extra 5 s for any queued TTS to fire
  await page.waitForTimeout(5000);

  const log: TtsEvent[] = await page.evaluate(() => (window as any).__ttsLog ?? []);

  const speaks = log.filter((e) => e.type === "speak" && e.text && e.text.length > 1);
  const cancels = log.filter((e) => e.type === "cancel");

  const allSpokenText = speaks.map((s) => s.text ?? "").join(" ").toLowerCase();

  // Dropped: sentence not found in any spoken text
  const dropped = SENTENCES.filter(
    (s) => !allSpokenText.includes(s.toLowerCase().slice(0, 20))
  ).length;

  // Repeated: same sentence text appears in >1 speak call
  const repeated = SENTENCES.filter(
    (s) =>
      speaks.filter((sp) => (sp.text ?? "").toLowerCase().includes(s.toLowerCase().slice(0, 20)))
        .length > 1
  ).length;

  const avgWords =
    speaks.length > 0
      ? Math.round(speaks.reduce((a, s) => a + (s.text ?? "").split(" ").length, 0) / speaks.length)
      : 0;

  const firstSpeak = speaks.length > 0 ? speaks[0].t - t0 : 99999;
  const lastSpeak  = speaks.length > 0 ? speaks[speaks.length - 1].t - t0 : 0;
  const lastSent   = sentenceTimes[sentenceTimes.length - 1];
  const keptUp = lastSpeak <= lastSent + 10000; // last speak within 10 s of last sentence

  // Naturalness heuristic
  let naturalScore = 7;
  if (dropped > 0)   naturalScore -= dropped * 2;
  if (repeated > 0)  naturalScore -= repeated;
  if (!keptUp)       naturalScore -= 2;
  if (avgWords > 60) naturalScore -= 1; // very long utterances sound robotic
  if (avgWords < 5)  naturalScore -= 2; // too fragmented
  naturalScore = Math.max(1, Math.min(10, naturalScore));

  const pass = dropped === 0 && repeated === 0 && keptUp;

  console.log(`\n  ══ Setup ${setup} ══`);
  console.log(`  speak calls: ${speaks.length}  cancel calls: ${cancels.length}`);
  console.log(`  avg words/speak: ${avgWords}`);
  console.log(`  dropped: ${dropped}  repeated: ${repeated}`);
  console.log(`  first speak delay: ${firstSpeak}ms  kept up: ${keptUp}`);
  console.log(`  naturalness (1-10): ${naturalScore}  PASS: ${pass}`);

  return {
    setup,
    speakCount: speaks.length,
    cancelCount: cancels.length,
    avgWordsPerSpeak: avgWords,
    sentencesDropped: dropped,
    sentencesRepeated: repeated,
    firstSpeakDelay: firstSpeak,
    naturalScore,
    keptUp,
    pass,
  };
}

test.describe("TTS Setup Benchmark", () => {
  const results: SetupResult[] = [];

  for (const setup of ["A", "B", "C", "D"] as const) {
    test(`Setup ${setup}`, async ({ page }) => {
      const result = await runSetup(page, setup);
      results.push(result);
    });
  }

  test("Summary: pick winner", async () => {
    if (results.length === 0) {
      console.log("  No results yet (run all setups first)");
      return;
    }

    console.log("\n  ╔══════════════════════════════════════════════════════╗");
    console.log(  "  ║                 BENCHMARK SUMMARY                   ║");
    console.log(  "  ╚══════════════════════════════════════════════════════╝\n");

    const header = "  Setup | Speaks | Cancels | AvgWords | Dropped | Repeated | Delay  | Natural | KeptUp | PASS";
    console.log(header);
    console.log("  " + "─".repeat(header.length - 2));

    for (const r of results) {
      console.log(
        `  ${r.setup.padEnd(5)}  | ${String(r.speakCount).padEnd(6)} | ${String(r.cancelCount).padEnd(7)} | ${String(r.avgWordsPerSpeak).padEnd(8)} | ${String(r.sentencesDropped).padEnd(7)} | ${String(r.sentencesRepeated).padEnd(8)} | ${String(r.firstSpeakDelay).padEnd(6)} | ${String(r.naturalScore).padEnd(7)} | ${String(r.keptUp).padEnd(6)} | ${r.pass ? "✅" : "❌"}`
      );
    }

    const passing = results.filter((r) => r.pass);
    const winner =
      passing.length > 0
        ? passing.sort((a, b) => b.naturalScore - a.naturalScore || a.firstSpeakDelay - b.firstSpeakDelay)[0]
        : results.sort((a, b) => b.naturalScore - a.naturalScore)[0];

    console.log(`\n  🏆  Winner: Setup ${winner.setup}`);
    console.log(`      Natural ${winner.naturalScore}/10 · ${winner.speakCount} speaks · ${winner.sentencesDropped} dropped · ${winner.sentencesRepeated} repeated`);
  });
});
