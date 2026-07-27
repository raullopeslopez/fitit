import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Register from './Register.jsx'
import * as api from './api.js'

vi.mock('./api.js')

describe('Register', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders username, password, and a submit button', () => {
    render(<Register onAuthenticated={() => {}} onSwitchToLogin={() => {}} />)
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument()
  })

  it('registers and reports the token on success', async () => {
    api.register.mockResolvedValue('tok-123')
    const onAuthenticated = vi.fn()
    render(<Register onAuthenticated={onAuthenticated} onSwitchToLogin={() => {}} />)

    await userEvent.type(screen.getByLabelText(/usuario/i), 'amigo')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 's3cretpass')
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))

    expect(api.register).toHaveBeenCalledWith('amigo', 's3cretpass')
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('tok-123'))
  })

  it('shows an error when the username is already taken', async () => {
    api.register.mockRejectedValue(Object.assign(new Error('username already taken'), { status: 409 }))
    render(<Register onAuthenticated={() => {}} onSwitchToLogin={() => {}} />)

    await userEvent.type(screen.getByLabelText(/usuario/i), 'amigo')
    await userEvent.type(screen.getByLabelText(/contraseña/i), 's3cretpass')
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe/i)
  })

  it('calls onSwitchToLogin when tapping "Ya tengo cuenta"', async () => {
    const onSwitchToLogin = vi.fn()
    render(<Register onAuthenticated={() => {}} onSwitchToLogin={onSwitchToLogin} />)

    await userEvent.click(screen.getByRole('button', { name: /ya tengo cuenta/i }))

    expect(onSwitchToLogin).toHaveBeenCalled()
  })
})
