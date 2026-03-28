export class AudioBuilder {
  private audioContext: AudioContext;
  private buffer: AudioBuffer;
  private sampleRate: number;

  constructor(totalDurationMs: number) {
    this.audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    this.sampleRate = this.audioContext.sampleRate;

    const totalSamples = Math.ceil((totalDurationMs / 1000) * this.sampleRate);
    this.buffer = this.audioContext.createBuffer(
      2,
      totalSamples,
      this.sampleRate,
    ); // 2 channels (stereo)
  }

  /**
   * Add an audio clip from a URL at a specific time in the final track
   */
  async add(
    url: string,
    startMsInResult: number,
    trimFromStartMs: number = 0,
    trimFromEndMs: number = 0,
  ): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const startSample = Math.floor((startMsInResult / 1000) * this.sampleRate);
    let samplesToCopy = audioBuffer.length;

    // Apply trimming
    const trimStartSamples = Math.floor(
      (trimFromStartMs / 1000) * this.sampleRate,
    );
    const trimEndSamples = Math.floor((trimFromEndMs / 1000) * this.sampleRate);
    samplesToCopy = Math.max(
      0,
      samplesToCopy - trimStartSamples - trimEndSamples,
    );

    if (samplesToCopy <= 0) return;

    const sourceStart = trimStartSamples;
    const destStart = startSample;

    // Copy each channel
    for (let ch = 0; ch < Math.min(2, audioBuffer.numberOfChannels); ch++) {
      const sourceData = audioBuffer.getChannelData(ch);
      const destData = this.buffer.getChannelData(ch);

      for (let i = 0; i < samplesToCopy; i++) {
        const destIndex = destStart + i;
        if (destIndex >= this.buffer.length) break;
        destData[destIndex] = sourceData[sourceStart + i];
      }
    }
  }

  /**
   * Convert the built buffer to a WAV Blob (ready for <audio> or Mediabunny)
   */
  async toBlob(): Promise<Blob> {
    const wavArrayBuffer = this.audioBufferToWav(this.buffer);
    return new Blob([wavArrayBuffer], { type: "audio/wav" });
  }

  /**
   * Convenience: Assign the result directly to an <audio> element
   */
  async assignToAudioElement(audioElement: HTMLAudioElement): Promise<void> {
    const blob = await this.toBlob();
    audioElement.src = URL.createObjectURL(blob);
  }

  // Simple WAV encoder (16-bit PCM)
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    // WAV header
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

    // Write PCM data
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
