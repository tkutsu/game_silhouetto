import { HUD } from './components/HUD'
import { Scene } from './components/Scene'
import { WinModal } from './components/WinModal'
import { useGame } from './state/store'

export default function App() {
  const seed = useGame((s) => s.seed)
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#081120] text-slate-100 select-none">
      <Scene />
      <HUD />
      <WinModal key={seed} />
    </main>
  )
}
