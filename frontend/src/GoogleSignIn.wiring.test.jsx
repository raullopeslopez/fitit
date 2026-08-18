import { render, screen } from '@testing-library/react'

import Login from './Login.jsx'
import Register from './Register.jsx'

vi.mock('./api.js')
// The button is Google's to draw; what these specs own is that both entrances
// offer it, and that neither loses its password form to it.
vi.mock('./GoogleSignIn.jsx', () => ({
  default: () => <div data-testid="google-signin" />,
}))

describe('Google sign-in on the way in', () => {
  it('is offered on the login screen, above the password form', () => {
    render(<Login onAuthenticated={() => {}} onSwitchToRegister={() => {}} />)
    expect(screen.getByTestId('google-signin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('is offered on the registration screen too', () => {
    render(<Register onAuthenticated={() => {}} onSwitchToLogin={() => {}} />)
    expect(screen.getByTestId('google-signin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument()
  })
})
