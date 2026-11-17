import { render, screen, waitFor } from '@testing-library/react'

import GoogleSignIn from './GoogleSignIn.jsx'
import * as api from './api.js'

vi.mock('./api.js')

const CLIENT_ID = 'fitit-test.apps.googleusercontent.com'

// Stands in for the script Google would have loaded. `initialize` is where the
// page hands over its callback, so the tests keep hold of it: calling it is the
// only way to play the part of somebody tapping the button.
function fakeGis() {
  const calls = { initialize: null, renderButton: null, prompted: false }
  window.google = {
    accounts: {
      id: {
        initialize: (config) => {
          calls.initialize = config
        },
        renderButton: (element, options) => {
          calls.renderButton = { element, options }
          element.appendChild(document.createTextNode('Continuar con Google'))
        },
        prompt: () => {
          calls.prompted = true
        },
      },
    },
  }
  return calls
}

describe('GoogleSignIn', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', CLIENT_ID)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.google
  })

  it('renders nothing at all when no client id is configured', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    fakeGis()
    const { container } = render(<GoogleSignIn onAuthenticated={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hands Google the client id and draws the outline button', async () => {
    const calls = fakeGis()
    render(<GoogleSignIn onAuthenticated={() => {}} />)

    await waitFor(() => expect(calls.initialize).not.toBeNull())
    expect(calls.initialize.client_id).toBe(CLIENT_ID)
    expect(calls.renderButton.options.theme).toBe('outline')
    expect(await screen.findByText(/continuar con google/i)).toBeInTheDocument()
  })

  it('offers One Tap so a returning account needs no tap at all', async () => {
    const calls = fakeGis()
    render(<GoogleSignIn onAuthenticated={() => {}} />)
    await waitFor(() => expect(calls.prompted).toBe(true))
  })

  it('trades the credential for our own token and reports it', async () => {
    const calls = fakeGis()
    api.googleLogin.mockResolvedValue('tok-google')
    const onAuthenticated = vi.fn()
    render(<GoogleSignIn onAuthenticated={onAuthenticated} />)

    await waitFor(() => expect(calls.initialize).not.toBeNull())
    calls.initialize.callback({ credential: 'id-token-from-google' })

    await waitFor(() => expect(api.googleLogin).toHaveBeenCalledWith('id-token-from-google'))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('tok-google'))
  })

  it('says so when the backend refuses the credential', async () => {
    const calls = fakeGis()
    api.googleLogin.mockRejectedValue(new Error('invalid google credential'))
    render(<GoogleSignIn onAuthenticated={() => {}} />)

    await waitFor(() => expect(calls.initialize).not.toBeNull())
    calls.initialize.callback({ credential: 'stale-token' })

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo entrar con google/i)
  })

  // Producción sólo abre cuentas nuevas a los emails de ALLOWED_EMAILS. Decir
  // «inténtalo otra vez» ahí te tiene repitiendo algo que no va a funcionar.
  it('says the account has no access when the backend will not open it one', async () => {
    const calls = fakeGis()
    api.googleLogin.mockRejectedValue(Object.assign(new Error('rejected'), { status: 403 }))
    render(<GoogleSignIn onAuthenticated={() => {}} />)

    await waitFor(() => expect(calls.initialize).not.toBeNull())
    calls.initialize.callback({ credential: 'id-token-from-google' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta de Google no tiene acceso a Fitit.')
  })
})
