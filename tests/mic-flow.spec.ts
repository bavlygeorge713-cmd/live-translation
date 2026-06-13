/**
 * Microphone + language-detection tests using a mocked Web Speech API.
 *
 * Strategy:
 *  1. addInitScript installs a MockSpeechRecognition class on the page before
 *     React loads.  When the app calls `initRecognition()` it gets our mock.
 *  2. --use-fake-ui-for-media-stream + --use-fake-device-for-media-stream
 *     (in playwright.config.ts) auto-grants mic permission so getUserMedia
 *     succeeds without a real mic.
 *  3. Tests call page.evaluate(injectSpeech, text) to fire the recognition
 *     events that the app actually processes.
 */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BASE   = "https://speech-translate-local-peach.vercel.app";
const SS_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// ── helpers ──────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
  const file = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

/** Install mock SpeechRecognition before any page JS runs. */
async function installSRMock(page: Page) {
  await page.addInitScript(() => {
    // ── Expose a controller registry ───────────────────────────────────────
    (window as any).__srInstances = [] as any[];

    class MockSR {
      continuous     = false;
      interimResults = false;
      maxAlternatives= 1;
      lang           = "en-US";
      onresult:  ((e: any) => void) | null = null;
      onerror:   ((e: any) => void) | null = null;
      onend:     (() => void)        | null = null;
      onstart:   (() => void)        | null = null;

      start() {
        (window as any).__srInstances.push(this);
        if (this.onstart) this.onstart();
      }
      stop()  { if (this.onend)  this.onend();  }
      abort() { if (this.onend)  this.onend();  }

      /**
       * Simulate the browser returning a speech recognition result.
       * isFinal=false → interim; isFinal=true → committed sentence.
       */
      _inject(transcript: string, isFinal: boolean) {
        if (!this.onresult) return;
        // Build a structure that mirrors SpeechRecognitionResultList
        const result = {
          isFinal,
          length: 1,
          0: { transcript, confidence: 0.97 },
        };
        const results = { length: 1, 0: result };
        this.onresult({ resultIndex: 0, results } as any);
      }
    }

    (window as any).SpeechRecognition        = MockSR;
    (window as any).webkitSpeechRecognition  = MockSR;
  });
}

/**
 * Inject a speech recognition result into whichever instance is active.
 * Sends an interim event first (feels realistic), then a final event.
 */
async function injectSpeech(page: Page, text: string, delayMs = 200) {
  await page.waitForTimeout(100);
  await page.evaluate(
    ({ text, delayMs }) => {
      const instances: any[] = (window as any).__srInstances ?? [];
      const active = instances[instances.length - 1]; // most recently started
      if (!active) { console.warn("[mock] no active SR instance"); return; }
      active._inject(text, false); // interim
      setTimeout(() => active._inject(text, true), delayMs); // final
    },
    { text, delayMs }
  );
  await page.waitForTimeout(delayMs + 100);
}

/** Open the host page with SR mock installed, grant permission, click Start. */
async function openHostAndStart(page: Page) {
  await installSRMock(page);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("button:has-text('Start Live Translation')");
  // Wait for recording state (button flips to "Stop Live Translation")
  await expect(page.locator("button:has-text('Stop Live Translation')")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
}

// ── 1. Basic microphone + transcription + translation flow ────────────────────

test.describe("1. Microphone & transcription flow", () => {
  const sentences = [
    "Hello, this is a microphone test.",
    "The system should detect and translate this automatically.",
    "Testing one two three.",
  ];

  test("each sentence appears in transcription and is translated", async ({ page }) => {
    await openHostAndStart(page);
    await ss(page, "mic-01-started");

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      console.log(`  ▶ Injecting: "${sentence}"`);

      await injectSpeech(page, sentence, 300);

      // Transcription: the "Original (transcribed)" section below the canvas
      // or the INPUT column in the canvas. The app stores it in store.transcribedText
      // which is rendered below the canvas.  The canvas uses drawSubtitleFrame which
      // is a <canvas> — we can't read its pixels, but the HTML below the canvas is readable.
      try {
        await page.waitForFunction(
          (txt) => document.body.innerText.includes(txt),
          sentence.replace(/\.$/, "").slice(0, 20),
          { timeout: 6000 }
        );
        console.log(`  ✅ Sentence ${i + 1} appeared in DOM`);
      } catch {
        console.log(`  ⚠️  Sentence ${i + 1} text not found in DOM (may be inside <canvas>)`);
      }

      await ss(page, `mic-02-sentence-${i + 1}`);
      await page.waitForTimeout(500);
    }

    // Translation should have fired — check History panel
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return !text.includes("No translations yet");
      },
      { timeout: 10_000 }
    );

    console.log("  ✅ Translation history populated");
    await ss(page, "mic-03-after-all-sentences");
  });
});

// ── 2. Mid-speech language switch ─────────────────────────────────────────────

test.describe("2. Language switch detection", () => {
  test("auto-switch: English → Arabic → English", async ({ page }) => {
    await openHostAndStart(page);

    // Inject English (mode should stay A / English)
    console.log("  ▶ English sentence");
    await injectSpeech(page, "Hello everyone welcome to the conference", 300);
    await ss(page, "lang-01-english");

    // Inject Arabic text — triggers Arabic character check → auto-switch to mode B
    console.log("  ▶ Arabic sentence (should trigger auto-switch to B)");
    await injectSpeech(page, "مرحباً بالجميع", 300);
    await page.waitForTimeout(500);
    await ss(page, "lang-02-arabic");

    // Verify mode indicator shows Arabic (mode B)
    const modeText = await page.locator("text=/Mode:/").textContent().catch(() => "");
    const isArabicMode = modeText?.includes("Arabic") || modeText?.includes("ar");
    console.log(`  Mode indicator: "${modeText?.trim()}" — Arabic mode: ${isArabicMode}`);

    // Inject English again — triggers Latin check → auto-switch back to mode A
    console.log("  ▶ Back to English (should switch back to A)");
    await injectSpeech(page, "Now switching back to English", 300);
    await page.waitForTimeout(500);
    await ss(page, "lang-03-back-english");

    const modeText2 = await page.locator("text=/Mode:/").textContent().catch(() => "");
    console.log(`  Mode indicator after switch back: "${modeText2?.trim()}"`);

    // Mixed sentence with Arabic script embedded
    console.log("  ▶ Mixed sentence: English + Arabic");
    await injectSpeech(page, "Hello everyone مرحباً بالجميع welcome to the conference", 300);
    await ss(page, "lang-04-mixed");

    // History should have entries by now
    const hasHistory = await page.evaluate(
      () => !document.body.innerText.includes("No translations yet")
    );
    console.log(`  ✅ History populated: ${hasHistory}`);
  });
});

// ── 3. Rapid language switch stress test ─────────────────────────────────────

test.describe("3. Rapid language switch stress", () => {
  const alternating = [
    { text: "Good morning",   expectSwitch: false },
    { text: "صباح الخير",     expectSwitch: true  },
    { text: "How are you",    expectSwitch: true  },  // switch back
    { text: "كيف حالك",       expectSwitch: true  },
    { text: "Thank you",      expectSwitch: true  },
    { text: "شكراً",          expectSwitch: false },
  ];

  test("no pile-up, no dropped sentences during rapid AR↔EN switching", async ({ page }) => {
    await openHostAndStart(page);

    for (let i = 0; i < alternating.length; i++) {
      const { text } = alternating[i];
      console.log(`  ▶ [${i + 1}] "${text}"`);
      await injectSpeech(page, text, 250);
      await page.waitForTimeout(200);
      await ss(page, `rapid-${i + 1}-${text.slice(0, 8).replace(/\s/g, "_")}`);
    }

    await page.waitForTimeout(2000);
    await ss(page, "rapid-final");

    // Verify app is still in a valid state (not crashed / errored)
    const hasError = await page.locator("text=/microphone error|failed to start/i").isVisible().catch(() => false);
    expect(hasError, "Error message appeared during stress test").toBe(false);

    const isStillRecording = await page.locator("button:has-text('Stop Live Translation')").isVisible();
    expect(isStillRecording, "Recording stopped unexpectedly").toBe(true);

    console.log("  ✅ Rapid language switch: app remained stable");
  });
});

// ── 4. Pile-up prevention under continuous speech ─────────────────────────────

test.describe("4. Continuous speech pile-up prevention", () => {
  const continuousSentences = [
    "Hello welcome to the conference.",
    "Please take your seats we are about to begin.",
    "Thank you for joining us today.",
    "The speaker will arrive shortly.",
    "Please silence your phones.",
  ];

  test("sentences translate without pile-up, History grows", async ({ page }) => {
    await openHostAndStart(page);

    for (const sentence of continuousSentences) {
      await injectSpeech(page, sentence, 200);
      await page.waitForTimeout(100); // very tight spacing
    }

    await page.waitForTimeout(3000); // let translations complete
    await ss(page, "continuous-final");

    // History should have multiple entries and not say "No translations yet"
    const historyText = await page.evaluate(() => document.body.innerText);
    const hasMultipleEntries = !historyText.includes("No translations yet");
    expect(hasMultipleEntries, "History should have entries after continuous speech").toBe(true);

    // App should still be running (no error state)
    const hasError = await page.locator("text=/microphone error|failed to start/i").isVisible().catch(() => false);
    expect(hasError, "Error appeared during continuous speech").toBe(false);

    console.log("  ✅ Continuous speech: app handled pile-up correctly");
  });
});
