let ctx: AudioContext | null = null

function tone(freq: number, at: number, duration: number, gain: number) {
  if (!ctx) ctx = new AudioContext()
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain, t + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration)
}

const PENTATONIC = [0, 2, 4, 7, 9]

/** Soft blip whose pitch climbs a pentatonic scale with each new closest-match step. */
export function closer(step: number) {
  const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5)
  tone(392 * 2 ** (semis / 12), 0, 0.18, 0.08)
}

export function win() {
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.07, 0.4, 0.1))
}
