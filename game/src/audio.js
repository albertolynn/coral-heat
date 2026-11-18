// Every sound in Coral Heat is synthesized with WebAudio: no audio files.
// Short one-shot voices (gunshot, punch, pickup, horn, jingle) are built from
// oscillators and filtered noise; the engine and the police siren are loops
// whose pitch follows the game; a small bass-and-keys loop plays the music.
// Everything is guarded: with no AudioContext (headless capture, or before
// the first click) the whole module is a silent no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  /** Create the context on the first user gesture; safe to call every frame. */
  function ensure() {
    if (ctx !== null || typeof window === 'undefined') return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBuffer() {
    const len = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let sharedNoise = null;

  /** A short tone: freq slides from f0 to f1 over `dur` seconds. */
  function tone(f0, f1, dur, type, vol, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A burst of filtered noise, for shots, hits and crashes. */
  function noise(dur, vol, freq, delay = 0) {
    if (!ensure() || muted) return;
    if (sharedNoise === null) sharedNoise = noiseBuffer();
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = sharedNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0, Math.random() * 0.2);
    src.stop(t0 + dur + 0.02);
  }

  const sounds = {
    gunshot() {
      noise(0.16, 0.5, 2600);
      tone(160, 50, 0.1, 'square', 0.22);
    },
    punch() {
      noise(0.08, 0.34, 700);
      tone(120, 60, 0.08, 'sine', 0.3);
    },
    crash(big) {
      noise(big ? 0.4 : 0.18, big ? 0.55 : 0.3, big ? 500 : 900);
      tone(90, 40, 0.22, 'triangle', 0.25);
    },
    honk() {
      tone(370, 340, 0.22, 'square', 0.1);
      tone(466, 440, 0.22, 'square', 0.07);
    },
    pickup() {
      tone(880, 1320, 0.09, 'sine', 0.2);
      tone(1320, 1760, 0.12, 'sine', 0.16, 0.06);
    },
    cash() {
      tone(1240, 1240, 0.06, 'triangle', 0.18);
      tone(1860, 1860, 0.1, 'triangle', 0.14, 0.05);
    },
    door() {
      noise(0.06, 0.2, 1200);
      tone(220, 140, 0.07, 'sine', 0.15, 0.02);
    },
    reload() {
      noise(0.05, 0.22, 2000);
      noise(0.05, 0.26, 1600, 0.14);
    },
    empty() {
      tone(1400, 1200, 0.04, 'square', 0.08);
    },
    hurt() {
      tone(300, 140, 0.16, 'sawtooth', 0.2);
    },
    jingle() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.2, i * 0.09));
    },
    fail() {
      tone(392, 392, 0.14, 'triangle', 0.18);
      tone(311, 311, 0.14, 'triangle', 0.18, 0.13);
      tone(262, 233, 0.3, 'triangle', 0.18, 0.26);
    },
    phone() {
      tone(1046, 1046, 0.09, 'sine', 0.16);
      tone(1046, 1046, 0.09, 'sine', 0.16, 0.16);
    },
  };

  /** Start or update the engine loop for the car the player drives; speed 0..1. */
  function engine(on, speedRatio, damaged) {
    if (!ensure()) return;
    if (!on) {
      if (engineGain) engineGain.gain.value = 0;
      return;
    }
    if (engineOsc === null) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 480;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    const wobble = damaged ? Math.random() * 14 : 0;
    engineOsc.frequency.value = 55 + speedRatio * 165 + wobble;
    engineGain.gain.value = muted ? 0 : 0.05 + speedRatio * 0.05;
  }

  /** The police siren: audible while any police car is near and active. */
  function siren(on, level) {
    if (!ensure()) return;
    if (sirenOsc === null) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    }
    if (!on || muted) {
      sirenGain.gain.value = 0;
      return;
    }
    const t = ctx.currentTime;
    sirenOsc.frequency.value = 660 + Math.sin(t * 5.2) * 190;
    sirenGain.gain.value = 0.028 * level;
  }

  // A lazy tropical loop: a two-bar bass line under soft keys, in A minor.
  const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 61.7, 0];
  const KEYS = [220, 261.6, 329.6, 196, 174.6, 220, 261.6, 164.8];
  function musicStep_() {
    if (muted || ctx === null) return;
    const i = musicStep % 16;
    const bar = Math.floor(musicStep / 16) % 2;
    if (BASS[i]) tone(BASS[i], BASS[i], 0.24, 'triangle', 0.16);
    if (i % 4 === 0) {
      const chord = KEYS[(Math.floor(musicStep / 4) + bar * 2) % KEYS.length];
      tone(chord, chord, 0.9, 'sine', 0.045);
      tone(chord * 1.5, chord * 1.5, 0.9, 'sine', 0.03);
    }
    musicStep += 1;
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    musicTimer = window.setInterval(musicStep_, 214);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    if (muted) {
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
    }
    return muted;
  }

  return { ensure, sounds, engine, siren, startMusic, toggleMute, isMuted: () => muted };
}
