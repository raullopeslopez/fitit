import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('backend unreachable'))
  }, [])

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 600,
        margin: '4rem auto',
        padding: '0 1rem',
        lineHeight: 1.5,
      }}
    >
      <h1>Fitit</h1>
      <p>Personal workout tracker. Log sets, see your previous marks.</p>
      <p>
        Backend health: <strong>{status}</strong>
      </p>
      <p style={{ color: '#666' }}>
        Scaffold ready. Build the first slice (log a set) with <code>/tdd</code>.
      </p>
    </main>
  )
}
