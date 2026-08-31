/**
 * A fast, easy-to-read replacement for `ffprobe`, built on Mediabunny.
 *
 * Usage:   npm run info -- [--fast | --full] [--] <file-or-url> [file-or-url ...]
 * Example: npm run info -- "public/frame counter.mp4"
 *
 * See development-plans/ffprobe-replacement.md.
 */

import {
  ALL_FORMATS,
  FilePathSource,
  Input,
  InputTrack,
  UrlSource,
} from "mediabunny";

const commandLineArguments = process.argv.slice(2);

/**
 * See the `--` option, below.
 * It works like `--` in a lot of command line programs.
 */
let ignoreFlags = false;
/**
 * If fast is true, then `track.computeFrameRateMetrics()` uses
 * the default `targetPacketCount`, and any *other* request with "compute"
 * in the name (e.g. `computeDuration()`) is skipped in favor of a cheaper,
 * metadata-based alternative.
 * Otherwise (the default) `track.computeFrameRateMetrics()` gets
 * `targetPacketCount: Number.MAX_SAFE_INTEGER`, and the other "compute*"
 * requests are used instead of their metadata-based alternative.
 *
 * See `--fast` and `--full`, below.
 */
let fast = false;
const filesToShow: string[] = [];

if (commandLineArguments.length == 0) {
  printHelp();
  process.exit(1);
} else {
  commandLineArguments.forEach((argument) => {
    if (argument == "--" && !ignoreFlags) {
      ignoreFlags = true;
    } else if (argument == "--fast" && !ignoreFlags) {
      fast = true;
    } else if (argument == "--full" && !ignoreFlags) {
      fast = false;
    } else {
      filesToShow.push(argument);
    }
  });
}

function printHelp(): void {
  console.log(
    `Usage: npm run info -- [--fast | --full] [--] <file-or-url> [file-or-url ...]

  --fast   Skip expensive "compute*" calls (exact duration, etc.) in favor
           of cheap, metadata-based estimates.  Frame rate metrics are still
           computed, just from a smaller sample of packets.
  --full   Do the expensive, precise version of everything.  (default)
  --       Treat every remaining argument as a filename, even if it starts
           with "-".

Arguments starting with "http:" or "https:" (case-insensitive) are treated
as URLs; everything else is treated as a local file path.`,
  );
}

function isUrl(fileOrUrl: string): boolean {
  return /^https?:\/\//i.test(fileOrUrl);
}

function formatSeconds(seconds: number | null): string {
  return seconds === null ? "unknown" : `${seconds.toFixed(6)} s`;
}

/** Only the disposition flags that are actually set -- most files set none of them. */
async function describeDisposition(track: InputTrack): Promise<string> {
  const disposition = await track.getDisposition();
  const setFlags = Object.entries(disposition)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return setFlags.length === 0 ? "(none)" : setFlags.join(", ");
}

async function showTrack(track: InputTrack): Promise<void> {
  console.log(`  --- Track ${track.number} (${track.type}) ---`);
  console.log(`  Start time: ${formatSeconds(await track.getFirstTimestamp())}`);
  const duration = fast
    ? await track.getDurationFromMetadata()
    : await track.computeDuration();
  console.log(
    `  Duration: ${formatSeconds(duration)}${fast ? " (from metadata)" : ""}`,
  );
  console.log(`  Disposition: ${await describeDisposition(track)}`);

  if (track.isVideoTrack()) {
    const metrics = await track.computeFrameRateMetrics({
      // The docs say to pass Infinity here for a full scan, but that throws
      // at runtime ("must be a non-negative number") -- MAX_SAFE_INTEGER
      // is the workaround, same as in dev/random-tests.ts.
      targetPacketCount: fast ? undefined : Number.MAX_SAFE_INTEGER,
    });
    console.log(`  Frame rate metrics:`);
    console.log(`    underlyingFrameRate: ${metrics.underlyingFrameRate}`);
    console.log(`    bestGuessFrameRate: ${metrics.bestGuessFrameRate}`);
    console.log(`    minFrameRate: ${metrics.minFrameRate}`);
    console.log(`    maxFrameRate: ${metrics.maxFrameRate}`);
    console.log(`    averageFrameRate: ${metrics.averageFrameRate}`);
    console.log(`    medianFrameRate: ${metrics.medianFrameRate}`);
    console.log(`    frameRateIsConstant: ${metrics.frameRateIsConstant}`);
    console.log(`    probedPacketCount: ${metrics.probedPacketCount}`);
    console.log(
      `  canBeTransparent (alpha): ${await track.canBeTransparent()}`,
    );
    console.log(`  Time resolution: ${await track.getTimeResolution()}`);

    console.log(`  Encoding info:`);
    console.log(`    Format: ${await track.getCodec()}`);
    console.log(
      `    Codec parameter string: ${await track.getCodecParameterString()}`,
    );
    console.log(
      `    Internal codec ID (container-level): ${await track.getInternalCodecId()}`,
    );
  }
}

async function showFile(fileOrUrl: string): Promise<void> {
  console.log(`\n=== ${fileOrUrl} ===`);
  const input = new Input({
    source: isUrl(fileOrUrl)
      ? new UrlSource(fileOrUrl)
      : new FilePathSource(fileOrUrl),
    formats: ALL_FORMATS,
  });
  try {
    const format = await input.getFormat();
    console.log(`Format: ${format.name} (${format.mimeType})`);
    console.log(`Start time: ${formatSeconds(await input.getFirstTimestamp())}`);
    const duration = fast
      ? await input.getDurationFromMetadata()
      : await input.computeDuration();
    console.log(
      `Duration: ${formatSeconds(duration)}${fast ? " (from metadata)" : ""}`,
    );
    for (const track of await input.getTracks()) {
      await showTrack(track);
    }
  } catch (error) {
    console.error(`Failed to read "${fileOrUrl}": ${error}`);
  } finally {
    input.dispose();
  }
}

for (const fileOrUrl of filesToShow) {
  await showFile(fileOrUrl);
}
