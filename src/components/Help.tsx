import { useGame } from '../state/store'

function Cursor({ className }: { className: string }) {
  return (
    <div className={`pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-white/30 shadow-[0_0_10px_rgba(255,255,255,0.6)] ${className}`} />
  )
}

/** A piece tumbling in clicks while a cursor drags across it. */
function TumbleDemo() {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#12233c]">
      <div className="demo-tumble h-11 w-11 rounded-lg bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-lg" />
      <Cursor className="demo-drag" />
    </div>
  )
}

/** The shadow and its dial ring spinning in clicks while a cursor circles them. */
function SpinDemo() {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#12233c]">
      <div className="demo-spin flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-400/70">
        <span className="text-3xl leading-none text-[#0a1626]">★</span>
      </div>
      <div className="demo-orbit absolute h-20 w-20">
        <Cursor className="left-1/2 top-0 -translate-x-1/2" />
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
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 p-6 text-center shadow-2xl">
        <p className="text-xs tracking-widest text-amber-400 uppercase">How to play</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Turn the piece until its shadow fits the outline on the blueprint. Spinning the blueprint clicks in 15° steps.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <TumbleDemo />
            <p className="mt-2 text-xs text-slate-400">Drag the piece to tumble it</p>
          </div>
          <div>
            <SpinDemo />
            <p className="mt-2 text-xs text-slate-400">Drag the blueprint to spin it</p>
          </div>
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
