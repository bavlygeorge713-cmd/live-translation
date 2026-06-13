// Global word-pacing queue — the single path through which translated words
// reach the screen. Words are tagged with their chunk's seqId; a lone timer
// chain drains them at a steady cadence so text flows evenly instead of in
// machine-gun bursts. isLast marks a chunk's final word (all words of a chunk
// are enqueued together), letting the consumer freeze the sentence.

export interface PacedWord {
  seqId: number;
  word: string;
  isLast: boolean;
}

export interface WordPacer {
  enqueue(seqId: number, text: string): number;
  /** Drain everything synchronously (e.g. when recording stops). */
  flush(): void;
  /** Drop all pending words and stop the timer. */
  clear(): void;
  size(): number;
}

const BASE_MS = 200; // steady reading pace (~5 words/sec, ahead of speech)
const CATCHUP_MS = 70; // faster pace while a backlog exists
const HIGH_WATER = 6; // switch to catch-up when queue grows past this
const LOW_WATER = 2; // return to base pace once queue drains to this

export function createWordPacer(onWord: (item: PacedWord) => void): WordPacer {
  let queue: PacedWord[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pace = BASE_MS;

  const drainOne = () => {
    timer = null;
    const item = queue.shift();
    if (!item) return;
    try {
      onWord(item);
    } catch {
      /* never break the drain chain */
    }
    if (queue.length > HIGH_WATER) pace = CATCHUP_MS;
    else if (queue.length <= LOW_WATER) pace = BASE_MS;
    if (queue.length > 0) timer = setTimeout(drainOne, pace);
  };

  return {
    enqueue(seqId, text) {
      const words = text.split(/\s+/).filter(Boolean);
      words.forEach((w, i) =>
        queue.push({ seqId, word: w, isLast: i === words.length - 1 }),
      );
      // First word of an idle queue appears immediately; the rest follow at pace
      if (words.length > 0 && !timer) timer = setTimeout(drainOne, 0);
      return words.length;
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      while (queue.length > 0) {
        const item = queue.shift()!;
        try {
          onWord(item);
        } catch {
          /* ignore */
        }
      }
      pace = BASE_MS;
    },
    clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      queue = [];
      pace = BASE_MS;
    },
    size: () => queue.length,
  };
}
