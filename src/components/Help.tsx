import type { ReactNode } from 'react'
import { useGame } from '../state/store'

/** A dashed dial with its knob clicking round, tilted to lie on its blueprint. */
function DialDemo({ tilt, children }: { tilt: string; children?: ReactNode }) {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#12233c]">
      <div style={{ transform: tilt }}>
        <div className="demo-spin relative flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-400/70">
          {children}
          <div className="absolute top-1/2 -right-1.5 h-3 w-3 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
        </div>
      </div>
    </div>
  )
}

const DIAL_DEMOS = [
  { tilt: 'perspective(160px) rotateX(62deg)', label: 'Floor dial turns the piece' },
  { tilt: 'perspective(160px) rotateY(58deg)', label: 'Side dial tips it' },
  { tilt: 'none', label: 'Back dial rolls it' },
]

export function Help() {
  const helpOpen = useGame((s) => s.helpOpen)
  const closeHelp = useGame((s) => s.closeHelp)
  if (!helpOpen) return null
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-center shadow-2xl">
        <p className="text-xs tracking-widest text-amber-400 uppercase">How to play</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Pull the knobs on the three blueprints to turn the piece until its shadow fits the outline. Each dial clicks in 15° steps.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {DIAL_DEMOS.map(({ tilt, label }, i) => (
            <div key={label}>
              <DialDemo tilt={tilt}>
                {i === 2 && <span className="text-2xl leading-none text-slate-300">★</span>}
              </DialDemo>
              <p className="mt-2 text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
        <button
          className="mt-6 w-full rounded-full bg-amber-400 py-2.5 font-medium text-slate-900 hover:bg-amber-300"
          onClick={closeHelp}
        >
          Play
        </button>
      </div>
    </div>
  )
}
