/**
 * This creates a complete audio clip by joining multiple clips.
 * It starts with all silence and you can add the clips wherever you need them.
 *
 * Overlapping clips are mixed:  each one is added to whatever is already
 * there, so two sounds at the same time are both heard.
 *
 * The result is always **mono**.  Every source is mixed down to one channel as
 * it is added.  Nothing recorded for these videos is really stereo:  a Mac
 * screen recording, for example, writes its one microphone signal into both
 * channels, and CapCut's exports have done the same.  One channel is less to
 * test and can't put a sound in only one ear by accident.
 */
export class AudioBuilder {
  /**
   * Like AudioContext, but this lets you process data at full speed.
   * AudioContext doesn't allow you to process things faster than realtime.
   */
  private audioContext: OfflineAudioContext;
  /**
   * This is the sound we are building.
   */
  private buffer: AudioBuffer;

  getAudioBuffer(): AudioBuffer {
    return this.buffer;
  }

  constructor(totalDurationMs: number) {
    const sampleRate = 48000;
    // OfflineAudioContext requires length >= 1 -- a project can legitimately
    // start out at duration 0 (e.g. an empty timeline before any clips have
    // been added yet), so clamp rather than let the constructor throw.
    this.audioContext = new OfflineAudioContext({
      length: Math.max(1, totalDurationMs * 1000),
      sampleRate,
    });
    const totalSamples = Math.max(
      1,
      Math.ceil((totalDurationMs / 1000) * sampleRate),
    );

    this.buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
  }

  async #createNewAudioBuffer(url: string) {
    const time1 = performance.now();
    const response = await fetch(url);
    const time2 = performance.now();
    const encodedSource = await response.arrayBuffer();
    const time3 = performance.now();
    // decodeAudioData() takes about ⅜ - ¾ of a second to decode 4 minutes and 18 seconds of audio.
    const sourceBuffer = await this.audioContext.decodeAudioData(encodedSource);
    const time4 = performance.now();
    const fileSizeKB = encodedSource.byteLength / 1024;
    false &&
      console.log(
        `[audio] fetch: ${(time2 - time1).toFixed(0)} ms (${fileSizeKB.toFixed(0)} KB, ` +
          `${((time2 - time1) / fileSizeKB).toFixed(3)} ms/KB) | ` +
          `arrayBuffer: ${(time3 - time2).toFixed(0)} ms | ` +
          `decode: ${(time4 - time3).toFixed(0)} ms`,
      );
    return sourceBuffer;
  }

  readonly #cache = new Map<string, Promise<AudioBuffer>>();
  readonly #resolved = new Map<string, AudioBuffer>();

  clearCache() {
    this.#cache.clear();
    this.#resolved.clear();
  }

  warmCache(url: string) {
    this.#findAudioBuffer(url);
  }

  /** Returns the decoded buffer synchronously if already cached, otherwise null. */
  getDecodedBuffer(url: string): AudioBuffer | null {
    return this.#resolved.get(url) ?? null;
  }

  #findAudioBuffer(url: string): Promise<AudioBuffer> {
    return this.#cache.getOrInsertComputed(url, (missingUrl) =>
      this.#createNewAudioBuffer(missingUrl).then((buf) => {
        this.#resolved.set(missingUrl, buf);
        return buf;
      }),
    );
  }

  /**
   * Add a new clip to the soundtrack.
   * It is mixed with (added to) any sounds already at that position.
   *
   * The sum can go past ±1, which clips.  That's fine for what this is used
   * for, a voiceover with the occasional overlap; the WAV encoder clamps, and
   * live playback clips the same way.
   * @param url Where to find the file.
   *
   * I typically use vite dev mode to run my project.
   * I put the files in the `/public` directory of the project.
   * And the url will start with "./".
   *
   * CORS can be an issue depending on the server.
   * Local files are forbidden.
   * @param startMsInDestination 0 to play the new clip at the the beginning of the video.
   * 1000 to start this clip 1 second after the video starts.
   *
   * Negative numbers are allowed:  the part of the clip that would play before
   * the video starts is skipped.  A sound clip may legally start before the
   * component that owns it, and that component may be at the very start.
   * @param trimFromStartMs Where to start the clip.
   * 0 to play the entire clip.
   * 500 to trim the first half second from the clip.
   * The default is 0.
   *
   * Negative numbers mean silence before the clip starts:  -500 starts the
   * clip half a second after `startMsInDestination`.
   *
   * If you fast forward the resulting video to `startMsInDestination` in your video player,
   * and you fast forward the initial clip in another player to `trimFromStartMs`,
   * and you hit play in both at the same time,
   * they'd play the same thing.
   *
   * **Video files and edit lists**: `decodeAudioData()` ignores the MP4/MOV container's
   * edit list. If the source is a video file (e.g. a Mac screen recording), the audio
   * samples start at media-time 0, but the *presentation* timeline may start later.
   * The caller is responsible for computing the offset from
   * `InputTrack.getFirstTimestamp()` (Mediabunny) and adding it to `trimFromStartMs`
   * so the audio aligns with the video's visible frames.
   * See `development-plans/import-audio-button.md` for the full plan.
   * @param length How much of this clip to include.
   * Stop copying this many milliseconds after `trimFromStartMs`.
   *
   * This value will be clamped to a reasonable range.
   * Requesting 0 or fewer milliseconds means to copy nothing.
   * We stop copying when we get to this much time,
   * the end of the source, or the end of the destination,
   * whichever comes first.
   *
   * The default is `Infinity`, to copy the entire clip or as much as will fit.
   * @returns This promise will resolve (or reject) when the request is complete.
   */
  async add(
    url: string,
    startMsInDestination: number,
    trimFromStartMs: number = 0,
    length: number = Infinity,
  ): Promise<void> {
    if (startMsInDestination < 0) {
      // Skip the part that would play before the video starts.
      trimFromStartMs -= startMsInDestination;
      length += startMsInDestination;
      startMsInDestination = 0;
    }
    if (trimFromStartMs < 0) {
      // Nothing to play before the source starts:  start later instead.
      startMsInDestination -= trimFromStartMs;
      length += trimFromStartMs;
      trimFromStartMs = 0;
    }

    const sourceBuffer = await this.#findAudioBuffer(url);

    const samplesPerMs = this.buffer.sampleRate / 1000;
    const destinationStart = Math.floor(startMsInDestination * samplesPerMs);
    const sourceStart = Math.floor(trimFromStartMs * samplesPerMs);
    // Stop at whichever runs out first:  the requested length, the source, or
    // the destination.  (decodeAudioData() already resampled the source to
    // our sample rate, so one count works for both.)
    const count = Math.max(
      0,
      Math.min(
        Math.floor(length * samplesPerMs),
        sourceBuffer.length - sourceStart,
        this.buffer.length - destinationStart,
      ),
    );
    if (count === 0) {
      return;
    }
    const destination = this.buffer
      .getChannelData(0)
      .subarray(destinationStart, destinationStart + count);
    const channels = Array.from(
      { length: sourceBuffer.numberOfChannels },
      (_, channel) =>
        sourceBuffer
          .getChannelData(channel)
          .subarray(sourceStart, sourceStart + count),
    );
    if (channels.length === 1) {
      // The common case.
      const source = channels[0];
      for (let i = 0; i < count; i++) {
        destination[i] += source[i];
      }
    } else {
      // Average the channels, don't sum them:  identical channels (the usual
      // "stereo") come out exactly as they went in, where a sum would double
      // the level and clip.
      const scale = 1 / channels.length;
      for (let i = 0; i < count; i++) {
        let sum = 0;
        for (const channel of channels) {
          sum += channel[i];
        }
        destination[i] += sum * scale;
      }
    }
  }

  async toBlob(): Promise<Blob> {
    const wavArrayBuffer = this.audioBufferToWav(this.buffer);
    return new Blob([wavArrayBuffer], { type: "audio/wav" });
  }

  async assignToAudioElement(audioElement: HTMLAudioElement): Promise<void> {
    const blob = await this.toBlob();
    audioElement.src = URL.createObjectURL(blob);
    // Optional: audioElement.load();
  }

  // Simple 16-bit PCM WAV encoder
  // This takes about 0.6 seconds to save 8½ minutes of data.
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    console.log("audioBufferToWav()");
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, buffer.length * numChannels * 2, true);

    let offset = 44;
    for (let ch = 0; ch < numChannels; ch++) {
      console.log("Wuz lots!");
      const channel = buffer.getChannelData(ch);
      for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, channel[i]));
        view.setInt16(
          offset,
          sample < 0 ? sample * 0x8000 : sample * 0x7fff,
          true,
        );
        offset += 2;
      }
    }

    return arrayBuffer;
  }
}
