/**
 * Precise word boundaries for a transcript.  Pure functions, no models:  the
 * caller supplies Whisper's words and wav2vec2's letter probabilities.
 *
 * Whisper is good at *what* was said and rough at *when*:  its word times
 * come from its attention weights, and stretch across pauses.  wav2vec2 was
 * trained to say which letter is being spoken in every 20 ms frame.  Forcing
 * Whisper's words onto those frames (CTC forced alignment, the method
 * WhisperX uses) gives boundaries good to a frame or two.
 *
 * Then, for trimming, each word gets two cut points:  the quietest moment
 * just before it and just after it.  Between two words close together they're
 * the same moment.
 *
 * See development-plans/transcripts.md.
 */

/** One word, with times in ms from the start of its file. */
export type TranscriptWord = {
  /** As Whisper wrote it, punctuation and all. */
  readonly text: string;
  readonly startMs: number;
  /**
   * Usually a little early.  The letter model marks each letter where it
   * starts, so the tail of the last letter runs past this.  Cut at
   * {@link cutAfterMs} instead.
   */
  readonly endMs: number;
  /** The best place to cut just before this word:  the quietest moment shortly before it. */
  readonly cutBeforeMs: number;
  /** The best place to cut just after this word, tail included. */
  readonly cutAfterMs: number;
  /**
   * Where the times came from.  `whisper` only when alignment wasn't possible:
   * a word with no letters to align, or a stretch that wouldn't fit.
   */
  readonly timing: "aligned" | "whisper";
  /**
   * How sure the letter model was, 0 to 1:  the average probability it gave
   * the letters it was made to hear.  Low in noise and mumbling.  Only
   * informative; low-confidence alignments are still kept, because measured
   * against full-precision models they beat Whisper's times anyway.
   */
  readonly confidence: number;
};

/** A word's times after alignment. */
export type AlignedTimes = {
  readonly startMs: number;
  readonly endMs: number;
  readonly timing: "aligned" | "whisper";
  readonly confidence: number;
};

/** A word straight from Whisper, times in ms. */
export type RoughWord = {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
};

// MARK: Words to letters

const ONES = [
  "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

/**
 * A whole number as English words, the way it's usually said:  1981 is
 * "NINETEEN EIGHTY ONE", 2026 is "TWO THOUSAND TWENTY SIX".  Good enough to
 * align against; it doesn't need to match the speaker exactly, just come close.
 */
export function spellNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) {
    return `${ONES[Math.floor(n / 100)]} HUNDRED${n % 100 ? " " + spellNumber(n % 100) : ""}`;
  }
  // Years are said in pairs:  NINETEEN EIGHTY ONE.
  if (n >= 1100 && n < 2000) {
    const rest = n % 100;
    return `${spellNumber(Math.floor(n / 100))} ${rest === 0 ? "HUNDRED" : rest < 10 ? "OH " + ONES[rest] : spellNumber(rest)}`;
  }
  if (n < 1_000_000) {
    return `${spellNumber(Math.floor(n / 1000))} THOUSAND${n % 1000 ? " " + spellNumber(n % 1000) : ""}`;
  }
  if (n < 1_000_000_000) {
    return `${spellNumber(Math.floor(n / 1_000_000))} MILLION${n % 1_000_000 ? " " + spellNumber(n % 1_000_000) : ""}`;
  }
  return "";
}

/** Symbols people say out loud, as the words they say. */
const SPOKEN_SYMBOLS: Record<string, string> = {
  "+": " PLUS ",
  "=": " EQUALS ",
  "%": " PERCENT ",
  "&": " AND ",
  "×": " TIMES ",
  "÷": " DIVIDED BY ",
};

/**
 * A word as the letter model would spell it:  upper case letters, apostrophes
 * and spaces only.  Numbers and a few symbols are spelled out.  Returns "" for
 * a word that can't be spelled, which then keeps Whisper's times.
 */
export function spellForAlignment(word: string): string {
  let s = word.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[’‘`]/g, "'");
  s = s.replace(/[+=%&×÷]/g, (symbol) => SPOKEN_SYMBOLS[symbol]);
  s = s.replace(/\d+/g, (digits) => ` ${spellNumber(Number(digits))} `);
  s = s.toUpperCase().replace(/[^A-Z' ]/g, " ");
  // An apostrophe only belongs inside a word:  "DON'T", not "'QUOTED'".
  s = s.replace(/(^|\s)'+|'+(?=\s|$)/g, "$1");
  return s.replace(/\s+/g, " ").trim();
}

// MARK: Forced alignment

/**
 * Letter probabilities from a CTC model like wav2vec2.
 *
 * `logProbs[frame * vocabularySize + token]` is the log probability that
 * `token` is being spoken in `frame`.
 */
export type CtcEmissions = {
  readonly logProbs: Float32Array;
  readonly vocabularySize: number;
  readonly frameCount: number;
  /** Length of one frame.  20 ms for wav2vec2. */
  readonly frameMs: number;
  /** The "nothing new" token. */
  readonly blank: number;
  /** The token between words, if the model has one ("|" for wav2vec2). */
  readonly wordSeparator?: number;
  /** The token for one letter, apostrophe included. */
  readonly tokenOf: (letter: string) => number | undefined;
};

/**
 * The best way to say `tokens` in order over frames [firstFrame, endFrame),
 * by the standard CTC Viterbi algorithm:  each token takes one or more frames,
 * with blanks allowed before, between and after.
 *
 * @returns For each token, the first and last frame it was given, plus the
 * average log probability over those frames (how sure the model was).
 * Undefined if the tokens can't fit, i.e. there are more of them than frames.
 */
export function forcedAlign(
  emissions: CtcEmissions,
  tokens: readonly number[],
  firstFrame: number,
  endFrame: number,
): { first: number; last: number; logProb: number }[] | undefined {
  const { logProbs, vocabularySize, blank } = emissions;
  const frames = endFrame - firstFrame;
  // The extended sequence:  blank, t0, blank, t1, …, blank.
  const states = 2 * tokens.length + 1;
  if (tokens.length === 0 || frames < tokens.length) return undefined;
  const stateToken = (s: number) => (s % 2 === 0 ? blank : tokens[(s - 1) / 2]);

  const NEG = -Infinity;
  let previous = new Float64Array(states).fill(NEG);
  let current = new Float64Array(states);
  /** How each cell was reached:  0 = stayed, 1 = from s − 1, 2 = from s − 2. */
  const moves = new Uint8Array(frames * states);
  const at = (frame: number, token: number) =>
    logProbs[(firstFrame + frame) * vocabularySize + token];

  previous[0] = at(0, blank);
  previous[1] = at(0, tokens[0]);
  for (let t = 1; t < frames; t++) {
    // A state can't be reached yet if too few frames have passed to get there,
    // or can't still finish if too few remain.  Skipping those is only a speed-up.
    const low = Math.max(0, states - 2 * (frames - t));
    const high = Math.min(states, 2 * t + 2);
    current.fill(NEG);
    for (let s = low; s < high; s++) {
      let best = previous[s];
      let move = 0;
      if (s >= 1 && previous[s - 1] > best) {
        best = previous[s - 1];
        move = 1;
      }
      // Skip a blank, unless that would merge two identical letters.
      if (s >= 2 && s % 2 === 1 && stateToken(s) !== stateToken(s - 2) && previous[s - 2] > best) {
        best = previous[s - 2];
        move = 2;
      }
      if (best === NEG) continue;
      current[s] = best + at(t, stateToken(s));
      moves[t * states + s] = move;
    }
    [previous, current] = [current, previous];
  }

  // End on the last token or the blank after it.
  let s = previous[states - 1] >= previous[states - 2] ? states - 1 : states - 2;
  if (previous[s] === NEG) return undefined;
  const result = tokens.map(() => ({ first: Infinity, last: -Infinity, logProb: 0 }));
  const counts = new Array<number>(tokens.length).fill(0);
  for (let t = frames - 1; t >= 0; t--) {
    if (s % 2 === 1) {
      const index = (s - 1) / 2;
      const span = result[index];
      span.first = firstFrame + t;
      span.last = Math.max(span.last, firstFrame + t);
      span.logProb += at(t, tokens[index]);
      counts[index]++;
    }
    s -= moves[t * states + s];
  }
  for (const [index, span] of result.entries()) {
    span.logProb = counts[index] ? span.logProb / counts[index] : NEG;
  }
  return result;
}

/** Extra audio to search on each side of a group of words, beyond Whisper's times. */
const WINDOW_MARGIN_MS = 600;

/** Groups of words are aligned separately, so the work stays small on long files. */
const MAX_WINDOW_MS = 20_000;

/**
 * Better times for Whisper's words, from the letter model's frames.
 *
 * The words are aligned in groups of up to about 20 seconds, split at the
 * longest pauses Whisper reported, each searched with a margin around
 * Whisper's own times.
 *
 * @returns One {@link AlignedTimes} per input word, in the same order.  A
 * word keeps Whisper's times only when it has no letters to align.
 */
export function alignWords(
  words: readonly RoughWord[],
  emissions: CtcEmissions,
): AlignedTimes[] {
  const result: AlignedTimes[] = words.map((w) => ({
    startMs: w.startMs,
    endMs: w.endMs,
    timing: "whisper",
    confidence: 0,
  }));
  const spellings = words.map((w) => spellForAlignment(w.text));

  // MARK: Groups
  const groups: [number, number][] = [];
  let groupStart = 0;
  for (let i = 1; i <= words.length; i++) {
    const tooLong =
      i < words.length && words[i].endMs - words[groupStart].startMs > MAX_WINDOW_MS;
    if (i === words.length || tooLong) {
      if (tooLong) {
        // Split at the biggest gap in this group, so no word is cut in two.
        let split = i;
        let widest = -Infinity;
        for (let j = groupStart + 1; j < i; j++) {
          const gap = words[j].startMs - words[j - 1].endMs;
          if (gap >= widest) {
            widest = gap;
            split = j;
          }
        }
        groups.push([groupStart, split]);
        groupStart = split;
      } else {
        groups.push([groupStart, i]);
      }
    }
  }

  // MARK: Align each group
  for (const [from, to] of groups) {
    const tokens: number[] = [];
    /** For each word in the group:  its letters' positions in `tokens`, or undefined. */
    const letterRanges: ([number, number] | undefined)[] = [];
    for (let i = from; i < to; i++) {
      const letters = [...spellings[i].replace(/ /g, "")]
        .map((letter) => emissions.tokenOf(letter))
        .filter((token): token is number => token !== undefined);
      if (letters.length === 0) {
        letterRanges.push(undefined);
        continue;
      }
      if (tokens.length > 0 && emissions.wordSeparator !== undefined) {
        tokens.push(emissions.wordSeparator);
      }
      letterRanges.push([tokens.length, tokens.length + letters.length]);
      tokens.push(...letters);
    }
    if (tokens.length === 0) continue;
    const firstFrame = Math.max(
      0,
      Math.floor((words[from].startMs - WINDOW_MARGIN_MS) / emissions.frameMs),
    );
    const endFrame = Math.min(
      emissions.frameCount,
      Math.ceil((words[to - 1].endMs + WINDOW_MARGIN_MS) / emissions.frameMs),
    );
    const spans = forcedAlign(emissions, tokens, firstFrame, endFrame);
    if (!spans) continue;
    for (let i = from; i < to; i++) {
      const range = letterRanges[i - from];
      if (!range) continue;
      const letters = spans.slice(range[0], range[1]);
      const logProb =
        letters.reduce((sum, span) => sum + span.logProb, 0) / letters.length;
      result[i] = {
        startMs: letters[0].first * emissions.frameMs,
        endMs: (letters[letters.length - 1].last + 1) * emissions.frameMs,
        timing: "aligned",
        confidence: Math.exp(logProb),
      };
    }
  }
  return result;
}

// MARK: Cut points

/** How finely to search for the quietest moment.  One 10 ms window at a time. */
const CUT_WINDOW_MS = 10;

/**
 * When two words touch, there's no gap to search, so look this far on each
 * side of the boundary instead.
 */
const CUT_SEARCH_WHEN_TOUCHING_MS = 40;

/**
 * How far from a word its cut points may be.  In a long pause the quietest
 * moment could be anywhere, and a cut seconds away from the word isn't a
 * useful place to trim.
 */
const CUT_REACH_MS = 200;

/**
 * The quietest moment in [fromMs, toMs]:  the middle of the 10 ms window with
 * the least energy, scanned in 5 ms steps.
 */
export function quietestMoment(
  samples: Float32Array,
  sampleRate: number,
  fromMs: number,
  toMs: number,
): number {
  const perMs = sampleRate / 1000;
  const windowLength = Math.max(1, Math.round(CUT_WINDOW_MS * perMs));
  const step = Math.max(1, Math.round(windowLength / 2));
  const first = Math.max(0, Math.floor(fromMs * perMs));
  const last = Math.min(samples.length - windowLength, Math.ceil(toMs * perMs) - windowLength);
  if (last < first) return (fromMs + toMs) / 2;
  let bestStart = first;
  let bestEnergy = Infinity;
  for (let start = first; start <= last; start += step) {
    let energy = 0;
    for (let i = start; i < start + windowLength; i++) energy += samples[i] * samples[i];
    if (energy < bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }
  return (bestStart + windowLength / 2) / perMs;
}

/**
 * The finished transcript:  each word with its best times and the best places
 * to cut before and after it.
 *
 * Between two words less than 2 × {@link CUT_REACH_MS} apart there's one cut,
 * the quietest moment between them, shared by both.  In a longer pause each
 * side gets its own, near its word.
 *
 * @param samples The same audio the words came from, mono.
 */
export function withCutPoints(
  words: readonly RoughWord[],
  times: readonly AlignedTimes[],
  samples: Float32Array,
  sampleRate: number,
): TranscriptWord[] {
  const fileMs = (samples.length / sampleRate) * 1000;
  const quietest = (from: number, to: number) =>
    quietestMoment(samples, sampleRate, Math.max(0, from), Math.min(fileMs, to));
  const cutBefore: number[] = [];
  const cutAfter: number[] = [];
  for (let i = 0; i <= times.length; i++) {
    const previous = times[i - 1];
    const next = times[i];
    if (!previous) {
      cutBefore[i] = quietest(next.startMs - CUT_REACH_MS, next.startMs);
    } else if (!next) {
      cutAfter[i - 1] = quietest(previous.endMs, previous.endMs + CUT_REACH_MS);
    } else {
      const gap = next.startMs - previous.endMs;
      if (gap <= CUT_WINDOW_MS * 2) {
        // Touching, or overlapping:  search around the boundary.
        const boundary = (next.startMs + previous.endMs) / 2;
        cutAfter[i - 1] = cutBefore[i] = quietest(
          boundary - CUT_SEARCH_WHEN_TOUCHING_MS,
          boundary + CUT_SEARCH_WHEN_TOUCHING_MS,
        );
      } else if (gap <= 2 * CUT_REACH_MS) {
        cutAfter[i - 1] = cutBefore[i] = quietest(previous.endMs, next.startMs);
      } else {
        cutAfter[i - 1] = quietest(previous.endMs, previous.endMs + CUT_REACH_MS);
        cutBefore[i] = quietest(next.startMs - CUT_REACH_MS, next.startMs);
      }
    }
  }
  return words.map((word, i) => ({
    text: word.text.trim(),
    startMs: times[i].startMs,
    endMs: times[i].endMs,
    cutBeforeMs: cutBefore[i],
    cutAfterMs: cutAfter[i],
    timing: times[i].timing,
    confidence: times[i].confidence,
  }));
}
