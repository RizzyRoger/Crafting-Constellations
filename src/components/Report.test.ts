import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Report } from './Report'

// No Firebase in node
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/callables', () => ({ describeError: vi.fn() }))

// A server render can't press anything, so each case seeds Report's state in the order it
// asks for it: open, reason, details, sending, error
const seeded = vi.hoisted(() => ({ values: [] as unknown[], at: 0 }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useState: (initial: unknown) => react.useState(seeded.values[seeded.at++] ?? initial) }
})

const render = (open: boolean, state = 'idle', error: string | null = null) => {
  seeded.values = [open, undefined, undefined, state, error]
  seeded.at = 0
  return renderToStaticMarkup(createElement(Report, { contentPath: 'groups/g/messages/m1', me: 'u1' }))
}

const STATUS = /<span class="meta live" role="status">(.*?)<\/span>/

// Talk and private notes aren't live (they'd read out their history), so Report says
// its own news
describe('Report', () => {
  it('is only a link until it is opened, so the history around it has nothing live in it', () => {
    expect(render(false)).toBe('<button type="button" class="link-btn">Report</button>')
  })

  it('opens with its status region in place and empty, before anything is sent', () => {
    const html = render(true)
    expect(html).toMatch(/Send report/)
    expect(html.match(STATUS)?.[1]).toBe('')
  })

  it('says thanks in that same region once sent, in place of the form', () => {
    const html = render(true, 'sent')
    expect(html).not.toMatch(/Send report/)
    expect(html.match(STATUS)?.[1]).toBe('Thanks — a person will look at this.')
  })

  it('reads out a refused report as an alert', () => {
    expect(render(true, 'idle', 'Something went wrong.')).toMatch(/<p class="error" role="alert">Something went wrong\.<\/p>/)
  })
})
