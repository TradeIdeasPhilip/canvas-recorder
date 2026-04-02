/**
 * This creates a complete audio clip by joining multiple clips.
 * It starts with all silence and you can add the clips wherever you need them.
 */
export class AudioBuilder {
  /**
   * This is the default audio context.
   */
  private audioContext: AudioContext;
  /**
   * This is the sound we are building.
   */
  private buffer: AudioBuffer;

  constructor(totalDurationMs: number) {
    this.audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const sampleRate = this.audioContext.sampleRate;
    const totalSamples = Math.ceil((totalDurationMs / 1000) * sampleRate);

    // Create buffer with 1 or 2 channels — we'll decide later based on first file
    this.buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate); // Start with mono
  }

  /**
   * Add a new clip to the soundtrack.
   * Overwrite any existing sounds at that position.
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
   * Negative numbers are explicitly prohibited.
   * @param trimFromStartMs Where to start the clip.
   * 0 to play the entire clip.
   * 500 to trim the first half second from the clip.
   * The default is 0.
   *
   * If you fast forward the resulting video to `startMsInDestination` in your video player,
   * and you fast forward the initial clip in another player to `trimFromStartMs`,
   * and you hit play in both at the same time,
   * they'd play the same thing.
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
    if (trimFromStartMs < 0 || startMsInDestination < 0) {
      // I could deal with these in a ration way.
      // If required I would.
      // But I can't imagine any case where I need that.
      // It would make the code more complicated, harder to read and harder to test.
      /*
        if (startMsInResult < 0) {
          trimFromStartMs -= startMsInResult;
          length += startMsInResult;
          startMsInResult=0;
        }
      */
      throw new Error("wtf");
    }
    const response = await fetch(url);
    const encodedSource = await response.arrayBuffer();
    const sourceBuffer = await this.audioContext.decodeAudioData(encodedSource);
    //console.log(this.audioContext.sampleRate)
    // this.audioContext.sampleRate → 48000.

    // If this is the first file and it's stereo, upgrade our buffer to stereo
    if (
      this.buffer.numberOfChannels === 1 &&
      sourceBuffer.numberOfChannels === 2
    ) {
      const newBuffer = this.audioContext.createBuffer(
        2,
        this.buffer.length,
        this.buffer.sampleRate,
      );
      // Copy existing mono data to both channels
      for (let ch = 0; ch < 2; ch++) {
        newBuffer.getChannelData(ch).set(this.buffer.getChannelData(0));
      }
      this.buffer = newBuffer;
    }

    const samplesPerMs = this.buffer.sampleRate / 1000;
    const destinationStartIndex = Math.floor(
      startMsInDestination * samplesPerMs,
    );
    const maxSamplesToCopy = Math.floor(length * samplesPerMs);
    const sourceStartIndex = Math.floor(trimFromStartMs * samplesPerMs);

    const numChannels = Math.min(
      this.buffer.numberOfChannels,
      sourceBuffer.numberOfChannels,
    );

    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = sourceBuffer.getChannelData(ch);
      const destinationData = this.buffer.getChannelData(ch);

      for (let i = 0; i < maxSamplesToCopy; i++) {
        const destinationIndex = destinationStartIndex + i;
        if (destinationIndex >= this.buffer.length) {
          break;
        }
        const sourceIndex = sourceStartIndex + i;
        if (sourceIndex >= sourceData.length) {
          break;
        }
        destinationData[destinationIndex] = sourceData[sourceStartIndex + i];
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
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
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
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
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
