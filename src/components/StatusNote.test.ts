import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Content } from '../lib/types'
import { StatusNote } from './StatusNote'

const render = (item: Pick<Content, 'status' | 'heldReason' | 'undelivered'>) => renderToStaticMarkup(createElement(StatusNote, { item }))

describe('StatusNote', () => {
  it('tells the writer what is still to come for their writing', () => {
    expect(render({ status: 'pending' })).toContain('checking…')
    expect(render({ status: 'held', heldReason: 'review' })).toContain('waiting for a person to read this')
    expect(render({ status: 'held', heldReason: 'crisis' })).toContain('held — a person will read this first')
  })

  it('says a note that can no longer reach them won’t, rather than that it waits for a person', () => {
    for (const heldReason of ['review', 'crisis', undefined] as const) {
      const html = render({ status: 'held', heldReason, undelivered: true })
      expect(html).toContain('not delivered — it won’t reach them')
      expect(html).not.toContain('a person')
    }
  })

  it('says nothing once writing is out or down', () => {
    for (const status of ['published', 'withdrawn', 'removed'] as const) {
      expect(render({ status, undelivered: true })).toBe('')
    }
  })
})
