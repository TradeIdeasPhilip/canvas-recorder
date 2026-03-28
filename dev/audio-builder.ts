export class AudioBuilder {
  private audioContext: AudioContext;
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

  async add(
    url: string,
    startMsInResult: number,
    trimFromStartMs: number = 0,
    trimFromEndMs: number = 0,
  ): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    // If this is the first file and it's stereo, upgrade our buffer to stereo
    if (
      this.buffer.numberOfChannels === 1 &&
      inputBuffer.numberOfChannels === 2
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

    const sampleRate = this.buffer.sampleRate;
    let startSample = Math.floor((startMsInResult / 1000) * sampleRate);
    let samplesToCopy = inputBuffer.length;

    const trimStartSamples = Math.floor((trimFromStartMs / 1000) * sampleRate);
    const trimEndSamples = Math.floor((trimFromEndMs / 1000) * sampleRate);

    samplesToCopy = Math.max(
      0,
      samplesToCopy - trimStartSamples - trimEndSamples,
    );
    if (samplesToCopy <= 0) return;

    const sourceStart = trimStartSamples;

    const numChannels = Math.min(
      this.buffer.numberOfChannels,
      inputBuffer.numberOfChannels,
    );

    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = inputBuffer.getChannelData(ch);
      const destData = this.buffer.getChannelData(ch);

      for (let i = 0; i < samplesToCopy; i++) {
        const destIdx = startSample + i;
        if (destIdx >= this.buffer.length) break;
        destData[destIdx] = sourceData[sourceStart + i];
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
