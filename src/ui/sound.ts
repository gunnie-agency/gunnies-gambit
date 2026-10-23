import { TONES, type MoveSound } from '../util/sounds';

/**
 * Events that count as a user gesture somewhere. WebKit on iPhone does not count a touch's pointerdown, only the end
 * of the touch and the click after it.
 */
const GESTURES = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;

/**
 * Plays the move sounds through Web Audio. Browsers only let a page start audio from a user gesture, so the audio
 * context is created (or resumed) in {@link unlock}, called on every gesture while sound is on (see {@link listen}).
 */
export class Sounds {
  enabled = false;
  private ctx: AudioContext | null = null;

  /** Unlocks audio on every gesture on `target`, in the capture phase so no handler can stop it first. */
  listen(target: EventTarget): void {
    for (const type of GESTURES) target.addEventListener(type, () => this.unlock(), true);
  }

  unlock(): void {
    if (!this.enabled || typeof AudioContext === 'undefined') return;
    this.ctx ??= new AudioContext();
    // Not only 'suspended': WebKit reports 'interrupted' after a call, another app's audio or a locked screen.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => undefined);
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
