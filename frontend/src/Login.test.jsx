import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Login from './Login.jsx'
import * as api from './api.js'

vi.mock('./api.js')

describe('Login', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders username, password, and a submit button', () => {
    render(<Login onAuthenticated={() => {}} />)
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('logs in and reports the token on success', async () => {
    api.login.mockResolvedValue('tok-123')
    const onAuthenticated = vi.fn()
    render(<Login onAuthenticated={onAuthenticated} />)

    await userEvent.type(screen.getByLabelText(/username/i), 'raul')
    await userEvent.type(screen.getByLabelText(/password/i), 's3cret')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(api.login).toHaveBeenCalledWith('raul', 's3cret')
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('tok-123'))
  })

  it('shows an error when the credentials are rejected', async () => {
    api.login.mockRejectedValue(new Error('invalid credentials'))
    render(<Login onAuthenticated={() => {}} />)

    await userEvent.type(screen.getByLabelText(/username/i), 'raul')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i)
  })
})
