import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sounds } from './sound';

/** Stands in for Web Audio: records each context made, starting in the given state. */
function stubAudio(state: string) {
  const contexts: { state: string; resume: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'AudioContext',
    class {
      state = state;
      resume = vi.fn(() => Promise.resolve());
      constructor() {
        contexts.push(this);
      }
    },
  );
  return contexts;
}

describe('Sounds', () => {
  let sounds: Sounds;

  beforeEach(() => {
    sounds = new Sounds();
    sounds.enabled = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resumes a context that is not running, also one that WebKit interrupted', () => {
    for (const state of ['suspended', 'interrupted']) {
      const contexts = stubAudio(state);
      sounds = new Sounds();
      sounds.enabled = true;
      sounds.unlock();
      expect(contexts[0]?.resume).toHaveBeenCalledOnce();
    }
  });

  it('leaves a running context alone', () => {
    const contexts = stubAudio('running');
    sounds.unlock();
    sounds.unlock();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).not.toHaveBeenCalled();
  });

  it('does not touch audio while sound is off', () => {
    const contexts = stubAudio('suspended');
    sounds.enabled = false;
    sounds.unlock();
    expect(contexts).toHaveLength(0);
  });

  it('unlocks on every kind of gesture, a touch that ends included', () => {
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) {
      const contexts = stubAudio('suspended');
      const target = new EventTarget();
      sounds = new Sounds();
      sounds.enabled = true;
      sounds.listen(target);
      target.dispatchEvent(new Event(type));
      expect(contexts[0]?.resume, type).toHaveBeenCalledOnce();
    }
  });
});
