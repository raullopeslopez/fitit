import { render, screen } from '@testing-library/react'

import App from './App.jsx'

describe('App', () => {
  it('shows the login screen when there is no token', () => {
    localStorage.clear()
    render(<App />)
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})
