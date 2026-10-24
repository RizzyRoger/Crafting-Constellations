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

const render = (open: boolean, state = 'idle') => {
  seeded.values = [open, undefined, undefined, state, null]
  seeded.at = 0
  return renderToStaticMarkup(createElement(Report, { contentPath: 'groups/g/messages/m1', me: 'u1' }))
}

const STATUS = /<span class="meta live" role="status">(.*?)<\/span>/

// Cancel used to close the form mid-send, taking the status region with it, so the thanks
// (or the error) arrived in a fresh element that screen readers don't read out
describe('Report while sending', () => {
  it('keeps the form open: Cancel waits, since the report is already on its way', () => {
    const html = render(true, 'sending')
    expect(html).toMatch(/<button type="button" class="link-btn" disabled="">Cancel<\/button>/)
  })

  it('says why both buttons are waiting', () => {
    expect(render(true, 'sending')).toMatch(/<button type="button" class="act act--quiet" disabled="">Sending…<\/button>/)
  })

  it('holds its empty status region, ready for the thanks', () => {
    expect(render(true, 'sending').match(STATUS)?.[1]).toBe('')
  })

  it('lets Cancel close the form before anything is sent', () => {
    expect(render(true)).toMatch(/<button type="button" class="link-btn">Cancel<\/button>/)
  })
})
