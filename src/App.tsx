import { HUD } from './components/HUD'
import { Scene } from './components/Scene'

export default function App() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#081120] text-slate-100 select-none">
      <Scene />
      <HUD />
    </main>
  )
}
