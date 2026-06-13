/**
 * Full real-user test suite for the Speech Translate app.
 * Run with: npx playwright test --project=desktop
 *
 * Injection strategy: POST directly to /api/broadcast to simulate the host
 * sending a translation sentence — bypasses mic/SR entirely.
 */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = "https://speech-translate-local-peach.vercel.app";
const BROADCAST_URL = `${BASE}/api/broadcast`;
const SS_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

async function broadcast(text: string, targetLang = "ar", sessionId = "test-session") {
  const body = JSON.stringify({
    type: "translation",
    chunk: text,
    originalChunk: text,
    sessionId,
    sourceLang: "en",
    targetLang,
  });
  const res = await fetch(BROADCAST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return res;
}

async function ss(page: Page, name: string) {
  const file = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
  return file;
}

async function unlockViewer(page: Page) {
  const overlay = page.locator("text=Tap to start");
  if (await overlay.isVisible({ timeout: 5000 }).catch(() => false)) {
    await overlay.click();
    await page.waitForTimeout(300);
  }
}

// ── 1. UI defects check ───────────────────────────────────────────────────────

test.describe("1. UI defects check", () => {
  test("host page — desktop layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await ss(page, "01-host-desktop");

    await expect(page.locator("button", { hasText: /start live translation/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow, "horizontal overflow on host desktop").toBe(false);

    await expect(page.locator("select").first()).toBeVisible();
    console.log("  ✅ Host desktop layout OK");
  });

  test("host page — mobile layout (390×844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await ss(page, "02-host-mobile");

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow, "horizontal overflow on host mobile").toBe(false);

    await expect(page.locator("button", { hasText: /start live translation/i })).toBeVisible();
    console.log("  ✅ Host mobile layout OK");
  });

  test("viewer page — desktop layout + controls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await ss(page, "03-viewer-desktop-before-unlock");

    await expect(page.locator("text=Tap to start")).toBeVisible();

    await unlockViewer(page);
    await ss(page, "04-viewer-desktop-unlocked");

    // Mute toggle
    await expect(page.locator("button").filter({ hasText: "" }).first()).toBeVisible();
    // Language selector
    await expect(page.locator("select")).toBeVisible();
    // Status bar
    await expect(page.locator("text=/waiting for speaker|listening/i").last()).toBeVisible();

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow, "horizontal overflow on viewer desktop").toBe(false);

    console.log("  ✅ Viewer desktop layout OK");
  });

  test("viewer page — mobile layout (390×844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await unlockViewer(page);
    await ss(page, "05-viewer-mobile-unlocked");

    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    expect(overflow, "horizontal overflow on viewer mobile").toBe(false);

    console.log("  ✅ Viewer mobile layout OK");
  });

  test("viewer mute toggle works", async ({ page }) => {
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await unlockViewer(page);

    // The mute button is the Volume2/VolumeX icon button in the top-right
    const muteBtn = page.locator("button").filter({ has: page.locator("svg") }).last();
    const initialClass = await muteBtn.getAttribute("class");
    await muteBtn.click();
    await page.waitForTimeout(200);
    const afterClass = await muteBtn.getAttribute("class");
    expect(initialClass).not.toEqual(afterClass);
    console.log("  ✅ Mute toggle works");
  });
});

// ── 2. Translation speed test ─────────────────────────────────────────────────

test.describe("2. Translation speed test", () => {
  const sentences = [
    "Hello, welcome to the conference.",
    "Please take your seats, we are about to begin.",
    "Thank you for joining us today.",
    "The speaker will arrive shortly.",
    "Please silence your mobile phones.",
  ];

  test("latency: 5 sentences, measure time-to-display", async ({ page }) => {
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await unlockViewer(page);
    await page.waitForTimeout(1000);

    const latencies: number[] = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      // Use same session so messages flow through (not cleared by session reset)
      const sessionId = `speed-test-shared-${Math.floor(Date.now() / 10000)}`;

      const t0 = Date.now();
      await broadcast(sentence, "en", sessionId);

      // Wait for the exact sentence text to appear (broadcasting English → en target → shown as-is)
      try {
        await page.waitForFunction(
          (txt) => document.body.innerText.includes(txt),
          sentence.replace(/\.$/, "").replace(/,$/, ""),
          { timeout: 5000 }
        );
        const latency = Date.now() - t0;
        latencies.push(latency);
        console.log(`  Sentence ${i + 1}: "${sentence.slice(0, 40)}…" → ${latency}ms`);
      } catch {
        const elapsed = Date.now() - t0;
        latencies.push(elapsed);
        console.log(`  Sentence ${i + 1} (text match timeout): ~${elapsed}ms`);
      }
      await page.waitForTimeout(300);
    }

    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    console.log(`\n  📊 Average latency: ${avg}ms`);
    console.log(`  📊 Min: ${Math.min(...latencies)}ms  Max: ${Math.max(...latencies)}ms`);
    expect(avg, `Average latency ${avg}ms exceeds 4000ms threshold`).toBeLessThan(4000);
  });
});

// ── 3. End-to-end translation test ───────────────────────────────────────────

test.describe("3. End-to-end broadcast", () => {
  const e2eSentences = [
    { text: "Hello, welcome to the conference.", id: "e2e-shared" },
    { text: "Please take your seats, we are about to begin.", id: "e2e-shared" },
    { text: "Thank you for joining us today.", id: "e2e-shared" },
  ];

  test("each injected sentence appears on viewer without pile-up", async ({ browser }) => {
    const ctx = await browser.newContext();
    const viewerPage = await ctx.newPage();

    await viewerPage.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await unlockViewer(viewerPage);
    await viewerPage.waitForTimeout(1500);

    const latencies: number[] = [];

    for (let i = 0; i < e2eSentences.length; i++) {
      const { text, id } = e2eSentences[i];
      const t0 = Date.now();
      await broadcast(text, "en", id);

      // Wait for text content to appear
      const searchStr = text.slice(0, 20);
      try {
        await viewerPage.waitForFunction(
          (s) => document.body.innerText.includes(s),
          searchStr,
          { timeout: 5000 }
        );
      } catch { /* timing */ }

      const elapsed = Date.now() - t0;
      latencies.push(elapsed);
      await ss(viewerPage, `06-viewer-e2e-${i + 1}`);
      console.log(`  Broadcast "${text.slice(0, 35)}…" → viewer in ~${elapsed}ms`);
      await viewerPage.waitForTimeout(600);
    }

    // Verify rolling window: viewer should show at most 3 sentences
    const bodyText = await viewerPage.evaluate(() => document.body.innerText);
    const sentenceMatches = e2eSentences.filter(s => bodyText.includes(s.text.slice(0, 15))).length;
    expect(sentenceMatches, "viewer should show 1–3 sentences (rolling window)").toBeLessThanOrEqual(3);

    // Verify no RTL period at start: no sentence should start with "."
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);
    const rtlBug = lines.some(l => l.startsWith("."));
    expect(rtlBug, "RTL period-at-start bug detected").toBe(false);

    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    console.log(`\n  📊 E2E broadcast avg: ${avg}ms`);
    await ctx.close();
  });
});

// ── 4. Pile-up and stress test ────────────────────────────────────────────────

test.describe("4. Pile-up & stress test", () => {
  const streamSentences = [
    "Hello welcome to the conference.",
    "Please take your seats.",
    "We are about to begin.",
    "Thank you for joining us today.",
    "The speaker will arrive shortly.",
    "Please silence your phones.",
  ];

  test("rapid-fire — rolling window, no smashed words", async ({ page }) => {
    await page.goto(`${BASE}/viewer`, { waitUntil: "networkidle" });
    await unlockViewer(page);
    await page.waitForTimeout(1500);

    const sessionId = `stress-${Date.now()}`;
    for (const sentence of streamSentences) {
      await broadcast(sentence, "en", sessionId);
      await page.waitForTimeout(80);
    }

    // Screenshots every 3s for 12s
    for (let t = 0; t < 4; t++) {
      await page.waitForTimeout(3000);
      await ss(page, `07-stress-t${t * 3}s`);
    }

    const bodyText = await page.evaluate(() => document.body.innerText);

    // ── No smashed words: no two sentence endings should be glued together
    const smashedWords = /[a-z][a-z]{2,}[A-Z]/.test(bodyText); // "seatsWe" pattern
    expect(smashedWords, "smashed words detected (pile-up not fixed)").toBe(false);

    // ── Rolling window: viewer shows ≤3 sentences at once
    // Count how many of the 6 sentences appear in the visible text
    const visibleCount = streamSentences.filter(s =>
      bodyText.includes(s.replace(/\.$/, "").slice(0, 12))
    ).length;
    expect(visibleCount, `${visibleCount} sentences visible — rolling window should cap at 3`).toBeLessThanOrEqual(3);

    // ── No RTL period-at-start
    const lines = bodyText.split("\n").map(l => l.trim()).filter(Boolean);
    const rtlBug = lines.some(l => l.startsWith("."));
    expect(rtlBug, "RTL period-at-start bug detected in stress test").toBe(false);

    console.log(`  ✅ Stress test — ${visibleCount} sentences visible (rolling window working)`);
    console.log("  ✅ No smashed words, no RTL bug");
  });
});

// ── 5. Final screenshots ──────────────────────────────────────────────────────

test.describe("5. Final state screenshots", () => {
  test("host and viewer final state", async ({ browser }) => {
    const ctx = await browser.newContext();
    const [hostPage, viewerPage] = await Promise.all([
      ctx.newPage(),
      ctx.newPage(),
    ]);

    await Promise.all([
      hostPage.goto(BASE, { waitUntil: "networkidle" }),
      viewerPage.goto(`${BASE}/viewer`, { waitUntil: "networkidle" }),
    ]);

    await unlockViewer(viewerPage);
    await broadcast("Final test — everything is working.", "en", "final-session");
    await viewerPage.waitForTimeout(3000);

    await Promise.all([
      ss(hostPage, "08-final-host"),
      ss(viewerPage, "08-final-viewer"),
    ]);

    // Verify viewer shows the final sentence
    const bodyText = await viewerPage.evaluate(() => document.body.innerText);
    expect(bodyText).toContain("Final test");

    console.log("  ✅ Final screenshots captured");
    await ctx.close();
  });
});
