import { setDoc, Timestamp } from 'firebase/firestore'
import { uploadBytes } from 'firebase/storage'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Professional } from './Professional'

// No DOM here, so the test calls the page itself and keeps its state and refs between calls:
// it can type, press Send and look at what the page shows next. Markup is a server render of that
const page = vi.hoisted(() => ({ hooks: [] as unknown[], at: 0, calling: false, application: null as unknown, stored: [] as string[] }))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {}, LOCAL_BACKEND: false }))
vi.mock('../lib/callables', () => ({ describeError: (e: unknown) => String(e) }))
vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ uid: 'alice', claims: { emailVerified: true }, profile: { pro: false } }) }))
vi.mock('../lib/live', () => ({ useDocData: () => ({ data: page.application, loading: false, error: null, pending: false }) }))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_: unknown, path: string) => path,
  serverTimestamp: () => 'now',
  setDoc: vi.fn(async () => undefined),
}))
vi.mock('firebase/storage', () => ({
  ref: (_: unknown, path: string) => path,
  getMetadata: async (path: string) => {
    if (page.stored.includes(path)) return {}
    throw Object.assign(new Error('missing'), { code: 'storage/object-not-found' })
  },
  uploadBytes: vi.fn(async () => undefined),
}))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const hook = (initial: () => unknown) => {
    const at = page.at++
    if (!(at in page.hooks)) page.hooks[at] = initial()
    return at
  }
  const useState = (initial: unknown) => {
    if (!page.calling) return react.useState(initial)
    const at = hook(() => initial)
    const set = (next: unknown) => {
      page.hooks[at] = typeof next === 'function' ? next(page.hooks[at]) : next
    }
    return [page.hooks[at], set]
  }
  const useRef = (initial: unknown) => (page.calling ? page.hooks[hook(() => ({ current: initial }))] : react.useRef(initial))
  return { ...react, useState, useRef }
})

type Props = Record<string, unknown> & { children?: ReactNode }
type Handler = (event: unknown) => unknown

const open = (application: unknown, stored: string[] = []) => {
  page.hooks = []
  page.application = application
  page.stored = stored
  vi.mocked(uploadBytes).mockClear()
  vi.mocked(setDoc).mockClear()
}

const call = () => {
  page.at = 0
  page.calling = true
  try {
    return Professional()
  } finally {
    page.calling = false
  }
}

const find = (node: ReactNode, match: (props: Props) => boolean): ReactElement<Props> | undefined => {
  if (Array.isArray(node)) return node.map((n: ReactNode) => find(n, match)).find(Boolean)
  if (!isValidElement<Props>(node)) return undefined
  return match(node.props) ? node : find(node.props.children, match)
}

const markup = () => renderToStaticMarkup(createElement(MemoryRouter, null, call()))
const on = (match: (props: Props) => boolean, name: string) => find(call(), match)?.props[name] as Handler
const type = (id: string, value: string) => on((p) => p.id === id, 'onChange')({ target: { value } })
const choose = (...names: string[]) =>
  on((p) => p.id === 'docs', 'onChange')({ target: { files: names.map((name) => ({ name, size: 2048, type: 'application/pdf' })) } })
const fill = () => {
  type('legal', 'Alice Example')
  type('region', 'Oregon, US')
  type('number', 'C-1234')
}
const send = () => on((p) => typeof p.onSubmit === 'function', 'onSubmit')({ preventDefault: () => undefined })
const refusal = () => find(call(), (p) => p.className === 'error')
const showBanner = (banner: { focus(): void }) => on((p) => p.className === 'banner', 'ref')(banner)
const uploaded = () => vi.mocked(uploadBytes).mock.calls.map(([path]) => path)
const sentFiles = () => (vi.mocked(setDoc).mock.calls[0]?.[1] as { files?: string[] } | undefined)?.files

const ALL = ['doc-1', 'doc-2', 'doc-3', 'doc-4', 'doc-5']
// A server time can carry microseconds; the folder is named in whole milliseconds, as storage.rules does
const reviewedAt = new Timestamp(1_729_700_000, 123_456_789)
const R = '1729700000123'

describe('the licence application', () => {
  it('says why it wasn’t sent out loud, and again on the next try', async () => {
    open(null)
    fill()
    await send()
    const first = refusal()
    expect(markup()).toMatch(/<p class="error" role="alert">Add at least one document\.<\/p>/)
    await send()
    const second = refusal()
    expect(second?.props.children).toBe(first?.props.children)
    // A new key is a new node, which screen readers read out again
    expect(second?.key).not.toBe(first?.key)
  })

  // The form, focused button and all, gives way to the banner, which takes the focus
  it('moves the focus to the thank-you once sent from here', async () => {
    open(null)
    fill()
    choose('licence.pdf')
    await send()
    expect(sentFiles()).toEqual(['doc-1'])
    page.application = { status: 'submitted', files: ['doc-1'] }
    expect(markup()).toMatch(/<div class="banner" tabindex="-1"><p class="pencil note">Thank you\./)
    const banner = { focus: vi.fn() }
    showBanner(banner)
    expect(banner.focus).toHaveBeenCalledTimes(1)
    showBanner(banner)
    expect(banner.focus).toHaveBeenCalledTimes(1)
  })

  it('leaves the focus alone when it opens on an application already sent', () => {
    open({ status: 'submitted', files: ['doc-1'] })
    const banner = { focus: vi.fn() }
    showBanner(banner)
    expect(banner.focus).not.toHaveBeenCalled()
  })

  it('lets a turned-down applicant who used every slot choose a corrected licence', () => {
    for (const status of ['denied', 'revoked']) {
      open({ status, files: ALL, reviewedAt, reviewNote: 'The scan is too blurry to read.' })
      const html = markup()
      expect(html).toMatch(/New licence documents \(optional\) — PDF or image, up to 5, 10 MB each/)
      expect(html).toMatch(/<input id="docs" type="file"[^>]*>/)
      expect(html.match(/<input id="docs"[^>]*>/)?.[0]).not.toMatch(/disabled/)
    }
  })

  it('adds new documents to free slots, past any a failed try left in Storage', async () => {
    open({ status: 'denied', files: ['doc-1', 'doc-2'], reviewedAt }, ['proDocs/alice/doc-3'])
    fill()
    choose('a.pdf', 'b.pdf')
    await send()
    expect(uploaded()).toEqual(['proDocs/alice/doc-4', 'proDocs/alice/doc-5'])
    expect(sentFiles()).toEqual(['doc-1', 'doc-2', 'doc-4', 'doc-5'])
  })

  // First doc-1 alone, then five in the last decision's folder: top-level slots are free, but a
  // sixth name would be refused after a write-once upload
  it('sends a corrected licence in its folder when the documents sent before fill the application', async () => {
    open({ status: 'denied', files: ALL.map((s) => `1729600000000/${s}`), reviewedAt }, ['proDocs/alice/doc-1'])
    fill()
    choose('corrected.pdf')
    expect(markup()).toMatch(/corrected\.pdf — sent instead of the documents you sent before\./)
    await send()
    expect(refusal()).toBeUndefined()
    expect(uploaded()).toEqual([`proDocs/alice/${R}/doc-1`])
    expect(sentFiles()).toEqual([`${R}/doc-1`])
  })
})
