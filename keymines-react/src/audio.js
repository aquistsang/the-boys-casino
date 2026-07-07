/**
 * Sound engine.
 * - clickSound(): synthesized mechanical "thock" (noise transient
 *   through a bandpass + low sine body thump).
 * - safeSound(): recorded keystroke sample for successful reveals,
 *   cloned per play so rapid presses overlap.
 */
let actx = null;
let noiseBuf = null;

function getCtx() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(actx.sampleRate * 0.1);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

export function clickSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const vary = 0.85 + Math.random() * 0.3;

    // Impact noise (the "clack")
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.playbackRate.value = vary;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 * vary;
    bp.Q.value = 0.9;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    noise.connect(bp); bp.connect(lp); lp.connect(nGain); nGain.connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.05);

    // Low body thump (the "thock")
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 * vary, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.06);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.35, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(oGain); oGain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.08);
  } catch (_) { /* audio unavailable */ }
}

/** Synthesized fallback boom (used if the MP3 can't play). */
function synthExplosion() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Noise blast, filtered down as it decays
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 0.5);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.9, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    noise.connect(lp); lp.connect(nGain); nGain.connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.6);

    // Sub-bass pitch drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.4);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.6, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(oGain); oGain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.5);
  } catch (_) { /* audio unavailable */ }
}

/** Short ascending chime for cashing out. */
export function winSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.3);
    });
  } catch (_) { /* audio unavailable */ }
}

const safeSample = new Audio('/sounds/office-keyboard-single-keystroke-gfx-sounds-1-1-00-00.mp3');
safeSample.preload = 'auto';

const explosionSample = new Audio('/sounds/freesound_community-rock-destroy-6409.mp3');
explosionSample.preload = 'auto';

export function safeSound() {
  try {
    const a = safeSample.cloneNode();
    a.volume = 0.9;
    a.play().catch(() => clickSound());
  } catch (_) {
    clickSound();
  }
}

/** Rock-destruction sample for mine hits and keyboard blow-ups. */
export function explosionSound() {
  try {
    const a = explosionSample.cloneNode();
    a.volume = 0.85;
    a.play().catch(() => synthExplosion());
  } catch (_) {
    synthExplosion();
  }
}
