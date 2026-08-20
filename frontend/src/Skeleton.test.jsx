import { act, render, screen } from '@testing-library/react'

import { MIN_ON_MS, SHOW_AFTER_MS, useWaitFlag } from './Skeleton.jsx'

// A probe rather than `renderHook`: the flag only matters as something a screen
// decides to draw with, and this is the shape every caller uses.
function Probe({ pending }) {
  const show = useWaitFlag(pending)
  return <span data-testid="flag">{show ? 'on' : 'off'}</span>
}

const flag = () => screen.getByTestId('flag').textContent
const tick = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useWaitFlag', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // A grey block that flashes for 80ms reads as a rendering fault, not as a
  // wait. Under the threshold the screen simply stays as it was.
  it('draws nothing before the threshold', async () => {
    render(<Probe pending={true} />)
    expect(flag()).toBe('off')
    await tick(SHOW_AFTER_MS - 10)
    expect(flag()).toBe('off')
  })

  it('draws once the wait is long enough to be worth saying', async () => {
    render(<Probe pending={true} />)
    await tick(SHOW_AFTER_MS + 10)
    expect(flag()).toBe('on')
  })

  // The whole point of the threshold: a fast answer never shows a skeleton at
  // all, however many times the screen re-renders on the way.
  it('never draws when the answer beats the threshold', async () => {
    const { rerender } = render(<Probe pending={true} />)
    await tick(SHOW_AFTER_MS - 100)
    rerender(<Probe pending={false} />)
    await tick(2000)
    expect(flag()).toBe('off')
  })

  // Once it is on screen it owes the eye a minimum. Swapping a skeleton for
  // content 30ms after drawing it is the same flash, arrived at from the other
  // side.
  it('holds for its minimum once drawn', async () => {
    const { rerender } = render(<Probe pending={true} />)
    await tick(SHOW_AFTER_MS + 10)
    expect(flag()).toBe('on')

    rerender(<Probe pending={false} />)
    await tick(MIN_ON_MS - 100)
    expect(flag()).toBe('on')

    await tick(200)
    expect(flag()).toBe('off')
  })

  it('lets go immediately when the minimum is already spent', async () => {
    const { rerender } = render(<Probe pending={true} />)
    await tick(SHOW_AFTER_MS + MIN_ON_MS + 100)
    rerender(<Probe pending={false} />)
    await tick(0)
    expect(flag()).toBe('off')
  })
})
