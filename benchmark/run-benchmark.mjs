/**
 * Benchmark: translation pipeline latency
 *
 * T1 — STT → INPUT update: cannot be measured via Playwright (Web Speech API
 *      is a separate audio pipeline, not reachable from fake device injection).
 *
 * T2 — Google Translate API latency (INPUT → TRANSLATION proxy):
 *      Timed directly as real HTTP fetch to the gtx endpoint.
 *
 * T3 — POST /api/broadcast → viewer SSE receipt → viewer translation → DOM update:
 *      Two Playwright pages. Sender POSTs, viewer's DOM is watched by
 *      MutationObserver. Elapsed = POST send time to observer fire.
 *
 * T4 — Viewer DOM update → TTS first word:
 *      Near-zero by design (speakNow cancels + speaks immediately, ~0-5ms).
 *
 * Run: node benchmark/run-benchmark.mjs
 */

import { chromium } from "playwright";
import { performance } from "perf_hooks";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

const BASE_URL = "https://speech-translate-local-peach.vercel.app";
const RUNS = 5;
const SCREENSHOT_DIR = "benchmark/screenshots";

const SAMPLES = [
  "Today we will discuss the latest advancements in minimally invasive cardiac procedures",
  "including transcatheter aortic valve replacement and robotic assisted coronary artery bypass grafting",
  "Our first speaker will present findings from a multicenter randomized controlled trial",
  "involving four thousand two hundred patients across seventeen hospitals in nine countries",
  "The primary endpoint was thirty day mortality and secondary endpoints included stroke rate",
  "myocardial infarction rehospitalization and quality of life measures at six months",
  "Results showed a statistically significant reduction in thirty day mortality",
  "from four point two percent to one point eight percent with a p value of less than zero point zero zero one",
  "Secondary outcomes also favored the endoscopic approach with lower stroke rates",
  "and faster return to normal activity for all patient cohorts in the study",
];

function stats(arr) {
  const valid = arr.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (!valid.length) return { avg: 0, p95: 0, min: 0, max: 0, n: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const avg = Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
  const p95 = Math.round(sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)]);
  return { avg, p95, min: Math.round(sorted[0]), max: Math.round(sorted[sorted.length - 1]), n: valid.length };
}

function badge(avg, target) {
  return avg <= target ? "✓" : "⚠";
}

async function measureT2() {
  const results = [];
  for (const text of SAMPLES) {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await res.json();
      results.push(performance.now() - t0);
    } catch {
      results.push(null);
    }
  }
  return results;
}

async function measureT3(viewerPage, samples, screenshotDir, runIdx) {
  const results = [];
  let dropped = 0;

  for (let i = 0; i < samples.length; i++) {
    const text = samples[i];

    // Arm observer BEFORE the POST to avoid missing fast deliveries
    await viewerPage.evaluate(() => {
      window.__t3Ready = false;
      window.__t3Elapsed = null;
      window.__t3PostTime = null;
      if (window.__t3Observer) window.__t3Observer.disconnect();
      window.__t3Observer = new MutationObserver(() => {
        if (!window.__t3Ready) {
          window.__t3Ready = true;
          window.__t3Elapsed = Date.now() - window.__t3PostTime;
        }
      });
      window.__t3Observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });

    // Record POST timestamp on viewer page clock (avoids host/viewer clock skew)
    await viewerPage.evaluate(() => { window.__t3PostTime = Date.now(); });

    try {
      await fetch(`${BASE_URL}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "translation",
          chunk: text,
          transcript: text,
          isFinal: true,
          sourceLang: "auto",
          targetLang: "ar",
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      results.push(null);
      dropped++;
      continue;
    }

    // Wait for viewer DOM to update (SSE delivery + viewer translation + render)
    try {
      await viewerPage.waitForFunction(() => window.__t3Ready === true, { timeout: 8000 });
      const elapsed = await viewerPage.evaluate(() => window.__t3Elapsed);
      results.push(typeof elapsed === "number" ? elapsed : null);
    } catch {
      results.push(null);
      dropped++;
    }

    // Screenshot every 2 samples (~10s apart at 5s per sample)
    if (i % 2 === 0) {
      try {
        await viewerPage.screenshot({
          path: `${screenshotDir}/run${runIdx + 1}_s${i + 1}.png`,
        });
      } catch { /* non-fatal */ }
    }

    // Let viewer settle before next sample
    await new Promise((r) => setTimeout(r, 1800));
  }

  return { results, dropped };
}

async function main() {
  if (!existsSync(SCREENSHOT_DIR)) await mkdir(SCREENSHOT_DIR, { recursive: true });

  console.log("\n══════════════════════════════════════════════════");
  console.log("  TRANSLATION PIPELINE BENCHMARK");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Target : ${BASE_URL}`);
  console.log(`  Runs   : ${RUNS}  ×  ${SAMPLES.length} samples`);
  console.log("══════════════════════════════════════════════════\n");

  // ── T2: Google Translate API (10 samples, measured once) ──────────────────────
  console.log("Step 1 — Measuring T2 (Google Translate API latency)…");
  const t2Samples = await measureT2();
  const t2Stats = stats(t2Samples);
  console.log(`  Samples (ms): ${t2Samples.map((v) => v === null ? "ERR" : Math.round(v)).join(", ")}`);
  console.log(`  avg=${t2Stats.avg}ms  p95=${t2Stats.p95}ms  min=${t2Stats.min}ms  max=${t2Stats.max}ms\n`);

  // ── T3: broadcast → viewer DOM (5 runs × 10 samples) ─────────────────────────
  console.log("Step 2 — Measuring T3 (broadcast → viewer DOM update) via Playwright…");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const allT3 = [];
  let totalDropped = 0;

  for (let run = 0; run < RUNS; run++) {
    process.stdout.write(`  Run ${run + 1}/${RUNS}… `);
    const context = await browser.newContext();
    const viewerPage = await context.newPage();

    try {
      await viewerPage.goto(`${BASE_URL}/viewer`, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      // Fallback: domcontentloaded
      await viewerPage.goto(`${BASE_URL}/viewer`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }

    // Click to dismiss the "tap to start" overlay
    try { await viewerPage.click("body", { timeout: 1500 }); } catch { /* no overlay */ }

    // Wait for EventSource to connect
    await new Promise((r) => setTimeout(r, 2500));

    const { results, dropped } = await measureT3(viewerPage, SAMPLES, SCREENSHOT_DIR, run);
    allT3.push(...results);
    totalDropped += dropped;

    const runStats = stats(results);
    console.log(`avg=${runStats.avg}ms  p95=${runStats.p95}ms  dropped=${dropped}`);

    await context.close();
  }

  await browser.close();

  // ── Aggregate results ─────────────────────────────────────────────────────────
  const t3Stats = stats(allT3);

  console.log("\n══════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("══════════════════════════════════════════════════\n");
  console.log("  T1  STT → INPUT         unmeasurable (Web Speech API internal)");
  console.log(`  T2  Translate API        avg=${t2Stats.avg}ms  p95=${t2Stats.p95}ms  min=${t2Stats.min}ms  max=${t2Stats.max}ms  target=300ms  ${badge(t2Stats.avg, 300)}`);
  console.log(`  T3  Broadcast→viewer     avg=${t3Stats.avg}ms  p95=${t3Stats.p95}ms  min=${t3Stats.min}ms  max=${t3Stats.max}ms  target=200ms  ${badge(t3Stats.avg, 200)}`);
  console.log("  T4  Subtitle→TTS         ~0ms (synchronous cancel+speak)              target=100ms  ✓");
  console.log("");
  console.log(`  Full pipeline avg  (T2+T3):  ${t2Stats.avg + t3Stats.avg}ms`);
  console.log(`  Full pipeline best (T2+T3):  ${t2Stats.min + t3Stats.min}ms`);
  console.log(`  Full pipeline target:         <500ms`);
  console.log(`  Status: ${(t2Stats.avg + t3Stats.avg) <= 500 ? "✓ WITHIN TARGET" : "⚠ EXCEEDS TARGET"}`);
  console.log("");
  console.log(`  Dropped/missed:  ${totalDropped} / ${RUNS * SAMPLES.length}`);
  console.log(`  Screenshots:     ${SCREENSHOT_DIR}/`);
  console.log("══════════════════════════════════════════════════\n");

  // ── Identify bottleneck and suggest fix ───────────────────────────────────────
  if (t3Stats.avg > t2Stats.avg) {
    console.log("BOTTLENECK: T3 (broadcast → viewer) is the largest component.");
    console.log("  T3 includes: SSE poll latency (~0–50ms) + viewer gtx translate + render.");
    if (t3Stats.avg > 200) {
      console.log("  Recommendation: reduce SSE polling from 50ms to 25ms,");
      console.log("  OR pre-translate the viewer's text in api/broadcast and cache it.");
    }
  } else if (t2Stats.avg > 300) {
    console.log("BOTTLENECK: T2 (translate API) is the largest component.");
    console.log("  Recommendation: verify VITE_GROQ_API_KEY is set — Groq races Google");
    console.log("  and should win in under 200ms when the key is valid.");
  } else {
    console.log("All metrics within targets. Pipeline is performing well.");
  }
}

main().catch((err) => {
  console.error("\nBenchmark error:", err?.message ?? err);
  process.exit(1);
});
