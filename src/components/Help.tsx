import { useGame } from '../state/store'

/** A dashed dial with its knob clicking round, like the ones on the blueprints. */
function DialDemo() {
  return (
    <div className="mx-auto flex h-32 w-32 items-center justify-center">
      <div className="demo-spin relative h-24 w-24 rounded-full border-2 border-dashed border-slate-400/70">
        <div className="absolute top-1/2 -right-2.5 h-5 w-5 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
      </div>
    </div>
  )
}

export function Help() {
  const helpOpen = useGame((s) => s.helpOpen)
  const closeHelp = useGame((s) => s.closeHelp)
  if (!helpOpen) return null
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-center shadow-2xl">
        <p className="text-xs tracking-widest text-amber-400 uppercase">How to play</p>
        <DialDemo />
        <p className="text-base leading-relaxed text-slate-200">
          Each of the 3 dials turns the object on a different axis. Fit its shadow into the outline on the blueprint.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Dials click in 15° steps. Use two fingers to turn two at once. Running out of time spends a Solve.
        </p>
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
