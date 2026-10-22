import { TONES, type MoveSound } from '../util/sounds';

/**
 * Plays the move sounds through Web Audio. Browsers only let a page start audio from a user gesture, so the audio
 * context is created (or resumed) in {@link unlock}, called on every pointer and key press while sound is on.
 */
export class Sounds {
  enabled = false;
  private ctx: AudioContext | null = null;

  unlock(): void {
    if (!this.enabled || typeof AudioContext === 'undefined') return;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  /** Plays a sound, once audio has been unlocked. Before that a move is silent, the opponent's first reply too. */
  play(sound: MoveSound): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx) return;
    const now = ctx.currentTime;
    for (const tone of TONES[sound]) {
      const start = now + tone.at;
      const end = start + tone.length;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      // A 5 ms attack and an exponential decay, so the note starts and ends without a click of its own.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}
