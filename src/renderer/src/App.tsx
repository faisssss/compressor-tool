import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { ToolId } from '@shared/types'
import Background from './components/Background'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import ToolView from './components/ToolView'
import { toolById } from './tools/registry'

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<ToolId | 'home'>('home')
  const tool = route === 'home' ? null : toolById(route)

  // Dropping a file anywhere outside a tool must not navigate the window to that file.
  useEffect(() => {
    const stop = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  return (
    <div className="relative flex h-full">
      <Background colors={tool?.colors ?? ['#8b5cf6', '#ec4899']} />
      <Sidebar current={route} onNavigate={setRoute} />
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="drag h-12 shrink-0" />
        <div className="min-h-0 flex-1">
          <AnimatePresence mode="wait">
            {tool ? <ToolView key={tool.id} tool={tool} /> : <Home key="home" onOpen={setRoute} />}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
