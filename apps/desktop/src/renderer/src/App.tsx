import { createRoot } from 'react-dom/client'
import './styles.css'

function App(): JSX.Element {
  return (
    <main className="workspace">
      <section className="intro">
        <h1>ScreenCoderDesktop</h1>
        <p>截图转代码桌面端 MVP</p>
      </section>
    </main>
  )
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(<App />)
}
