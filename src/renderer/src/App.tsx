import { useEffect, useState } from 'react'
import type { ToolId } from '@shared/types'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import ToolView from './components/ToolView'
import { toolById } from './tools/registry'

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<ToolId | 'home'>('home')
  // Tools stay mounted once opened, so switching back and forth is instant and keeps files and results.
  const [opened, setOpened] = useState<ToolId[]>([])

  const navigate = (next: ToolId | 'home'): void => {
    if (next !== 'home') setOpened((o) => (o.includes(next) ? o : [...o, next]))
    setRoute(next)
  }

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
    <div className="flex h-full">
      <Sidebar current={route} onNavigate={navigate} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-12 shrink-0" />
        <div className="min-h-0 flex-1">
          <div className={route === 'home' ? 'h-full animate-view-in' : 'hidden'}>
            <Home onOpen={navigate} />
          </div>
          {opened.map((id) => (
            <div key={id} className={route === id ? 'h-full animate-view-in' : 'hidden'}>
              <ToolView tool={toolById(id)} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
