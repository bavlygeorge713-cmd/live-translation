/**
 * 20-sentence zero-delay stress test.
 * All 20 broadcasts fire back-to-back with no gap — worst case for the old
 * single-key overwrite architecture. With the Redis list queue every message
 * must be preserved and delivered. Target: 20/20.
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE          = "https://speech-translate-local-peach.vercel.app";
const BROADCAST_URL = `${BASE}/api/broadcast`;
const SS_DIR        = path.join(__dirname, "screenshots-stress");
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

const SENTENCES = [
  "Alpha one the first sentence",
  "Bravo two the second sentence",
  "Charlie three the third sentence",
  "Delta four the fourth sentence",
  "Echo five the fifth sentence",
  "Foxtrot six the sixth sentence",
  "Golf seven the seventh sentence",
  "Hotel eight the eighth sentence",
  "India nine the ninth sentence",
  "Juliet ten the tenth sentence",
  "Kilo eleven the eleventh sentence",
  "Lima twelve the twelfth sentence",
  "Mike thirteen the thirteenth sentence",
  "November fourteen the fourteenth sentence",
  "Oscar fifteen the fifteenth sentence",
  "Papa sixteen the sixteenth sentence",
  "Quebec seventeen the seventeenth sentence",
  "Romeo eighteen the eighteenth sentence",
  "Sierra nineteen the nineteenth sentence",
  "Tango twenty the twentieth sentence",
];

async function ss(page: Page, name: string) {
  await page.screenshot({ path: path.join(SS_DIR, `${name}.png`), fullPage: true });
}

async function broadcast(chunk: string, batchId: string) {
  const res = await fetch(BROADCAST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "translation", chunk, targetLang: "ar", isFinal: true, batchId, transcript: chunk, sourceLang: "en" }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`Broadcast failed: ${JSON.stringify(data)}`);
}

test.describe("20-sentence zero-delay stress test", () => {
  test("all 20 sentences delivered", async ({ page }) => {
    test.setTimeout(120_000);

    const BATCH_ID = `stress-${Date.now()}`;

    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });

    // Unlock audio
    const tap = page.locator("text=Tap to Enable Audio");
    if (await tap.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.mouse.click(640, 360);
      await page.waitForFunction(
        () => !document.body.innerText.includes("Tap to Enable Audio"),
        { timeout: 4000 }
      ).catch(() => {});
      await page.waitForTimeout(300);
    }

    // Wait for Connected
    let connected = false;
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("Connected"),
        { timeout: 8000 }
      );
      connected = true;
    } catch { connected = false; }
    console.log(`\n  CONNECTION: ${connected ? "✅" : "❌"}`);
    await ss(page, "00-connected");

    // ── Fire all 20 broadcasts with NO delay ─────────────────────────────────
    console.log(`\n  Firing all 20 broadcasts with 0ms delay...`);
    const t0 = Date.now();
    for (let i = 0; i < SENTENCES.length; i++) {
      await broadcast(SENTENCES[i], BATCH_ID);
    }
    const fireMs = Date.now() - t0;
    console.log(`  All 20 fired in ${fireMs}ms`);

    // ── Wait for delivery, then snapshot the DOM once ────────────────────────
    // Wait for msg1 (can't be a stale seed from a prior run — each run has a
    // unique batchId and the viewer clears interim state but not confirmed lines).
    // Then give an additional 8s for all remaining polls to deliver msgs 2-20.
    // Using msg20 as the signal is unreliable — it may already be in the DOM
    // from the previous run's seed, causing a false-early resolve.
    const prefixes = SENTENCES.map(s => s.slice(0, 20));
    console.log(`\n  Waiting for msg1 to confirm first poll fired...`);

    await page.waitForFunction(
      (pfx) => document.body.innerText.includes(pfx),
      prefixes[0],  // "Alpha one the first" — unique, never in seed
      { timeout: 20_000 }
    ).catch(() => console.log("  ⚠ msg1 never appeared"));

    // Wait an additional 8 s (16 × 500ms polls) so all 20 can accumulate
    console.log(`  msg1 found (or timed out). Settling 8s for remaining polls...`);
    await page.waitForTimeout(8000);
    await ss(page, "01-final-state");

    // Snapshot DOM once and check all sentences
    const bodyText = await page.evaluate(() => document.body.innerText);

    const receivedMask: boolean[] = new Array(SENTENCES.length).fill(false);
    const droppedNums: number[] = [];

    for (let i = 0; i < SENTENCES.length; i++) {
      const found = bodyText.includes(prefixes[i]);
      receivedMask[i] = found;
      if (found) {
        console.log(`  [${String(i + 1).padStart(2)}] ✅ "${SENTENCES[i].slice(0, 40)}"`);
      } else {
        droppedNums.push(i + 1);
        console.log(`  [${String(i + 1).padStart(2)}] ❌ DROPPED`);
      }
    }

    const received = receivedMask.filter(Boolean).length;
    const rate = Math.round((received / SENTENCES.length) * 100);

    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║      20-SENTENCE STRESS REPORT       ║`);
    console.log(`  ╚══════════════════════════════════════╝`);
    console.log(`  Inject time   : ${fireMs}ms for 20 messages`);
    console.log(`  Delivered     : ${received}/20 (${rate}%)`);
    console.log(`  Dropped       : ${droppedNums.length > 0 ? droppedNums.join(", ") : "none"}`);
    console.log(`  Connection    : ${connected ? "✅" : "❌"}`);

    expect(connected, "Viewer must show Connected").toBe(true);
    expect(droppedNums, `Dropped sentences: ${droppedNums.join(", ")}`).toHaveLength(0);
  });
});
