// Web Audio graph that sits between the <audio> element and the speakers.
// Owned by the player store: whenever a new Audio element is created, call
// attachAudio(a) to route it through the filter chain.
//
// Graph:
//
//   MediaElementSource(a)
//        │
//   ┌────┴────┐
//   │  Bass   │  lowshelf 200 Hz
//   └────┬────┘
//   ┌────┴────┐
//   │  Mid    │  peaking 1000 Hz Q=1
//   └────┬────┘
//   ┌────┴────┐
//   │ Treble  │  highshelf 4000 Hz
//   └────┬────┘
//        │
//     Splitter
//        ├────► dryGain ──┐
//        │                ├─► masterGain ─► destination
//        └── convolver ──►│
//                     wetGain
//
// The convolver is loaded lazily with a synthetic impulse response so we
// don't need to ship an .wav asset.

let ctx: AudioContext | null = null
let bass: BiquadFilterNode | null = null
let mid: BiquadFilterNode | null = null
let treble: BiquadFilterNode | null = null
let dryGain: GainNode | null = null
let wetGain: GainNode | null = null
let masterGain: GainNode | null = null
let convolver: ConvolverNode | null = null

// Guard: WebAudio spec forbids calling createMediaElementSource on the same
// element twice. We remember which elements we've already routed.
const routed = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()

function ensureCtx(): AudioContext {
  if (ctx) return ctx
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  ctx = new AC()

  bass = ctx.createBiquadFilter()
  bass.type = 'lowshelf'
  bass.frequency.value = 200
  bass.gain.value = 0

  mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1000
  mid.Q.value = 1
  mid.gain.value = 0

  treble = ctx.createBiquadFilter()
  treble.type = 'highshelf'
  treble.frequency.value = 4000
  treble.gain.value = 0

  dryGain = ctx.createGain()
  dryGain.gain.value = 1

  wetGain = ctx.createGain()
  wetGain.gain.value = 0

  convolver = ctx.createConvolver()
  convolver.buffer = makeSyntheticImpulseResponse(ctx, 2.6, 3.4)

  masterGain = ctx.createGain()
  masterGain.gain.value = 1

  // Wire the filter chain (elements attach into `bass` via attachAudio).
  bass.connect(mid)
  mid.connect(treble)
  // treble → dry
  treble.connect(dryGain)
  dryGain.connect(masterGain)
  // treble → convolver → wet
  treble.connect(convolver)
  convolver.connect(wetGain)
  wetGain.connect(masterGain)

  masterGain.connect(ctx.destination)
  return ctx
}

export function attachAudio(a: HTMLAudioElement): void {
  const c = ensureCtx()
  if (routed.has(a)) return
  // Resume the context on the next user gesture; browsers block autoplay
  // otherwise.
  if (c.state === 'suspended') {
    void c.resume().catch(() => {
      /* ignore */
    })
  }
  const src = c.createMediaElementSource(a)
  routed.set(a, src)
  if (bass) src.connect(bass)
}

// Bass / mid / treble gain in dB. Range roughly -12..+12.
export function setBassDb(db: number): void {
  ensureCtx()
  if (bass) bass.gain.value = db
}
export function setMidDb(db: number): void {
  ensureCtx()
  if (mid) mid.gain.value = db
}
export function setTrebleDb(db: number): void {
  ensureCtx()
  if (treble) treble.gain.value = db
}

// Reverb wet 0..1. Also crossfades the dry signal so total loudness stays
// roughly the same as wet ramps up.
export function setReverbAmount(wet: number): void {
  ensureCtx()
  const w = Math.max(0, Math.min(1, wet))
  if (wetGain) wetGain.gain.value = w
  if (dryGain) dryGain.gain.value = 1 - w * 0.4
}

// Master gain 0..1 — used to hard-mute without touching HTMLAudio volume.
export function setMasterGain(g: number): void {
  ensureCtx()
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, g))
}

// Synthesised exponential-decay impulse response. Not a real convolution reverb
// but sounds respectable for a music app.
function makeSyntheticImpulseResponse(
  ac: AudioContext,
  seconds: number,
  decay: number
): AudioBuffer {
  const rate = ac.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ac.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
  }
  return buf
}
