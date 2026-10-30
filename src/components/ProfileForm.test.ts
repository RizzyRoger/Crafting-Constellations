import { checkPenName, PEN_NAME_HINTS } from '@moderation'
import { createElement, isValidElement, type ElementType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileForm } from './ProfileForm'

// The form's first render needs no Firebase; keep the SDK from starting in node. saveProfile answers
// as each case says
const calls = vi.hoisted(() => ({ saveProfile: vi.fn(), problemOf: vi.fn() }))
vi.mock('../lib/callables', () => ({ saveProfile: calls.saveProfile, problemOf: calls.problemOf, describeError: vi.fn() }))

// A server render can't press anything, so a case seeds the form's state in the order it asks for it:
// pen name, pigment, note, busy, error. What the form last sets each to is kept, to render again with
const seeded = vi.hoisted(() => ({ values: [] as unknown[], at: 0, set: [] as unknown[] }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useState: (initial: unknown) => {
      const at = seeded.at++
      const [value, set] = react.useState(seeded.values[at] ?? initial)
      return [value, (next: unknown) => ((seeded.set[at] = next), set(next))]
    },
  }
})

beforeEach(() => {
  calls.saveProfile.mockReset()
  calls.problemOf.mockReset()
  seeded.set = []
})

const props = (onSaved?: () => void) => ({ uid: 'u1', submitLabel: 'Save', onSaved })

const render = (onSaved?: () => void, values: unknown[] = []) => {
  seeded.values = values
  seeded.at = 0
  return renderToStaticMarkup(createElement(ProfileForm, props(onSaved)))
}

type El = ReactElement<{ children?: ReactNode; onSubmit?: (e: { preventDefault: () => void }) => void }>

const find = (node: ReactNode, type: ElementType): El | null => {
  if (Array.isArray(node)) return node.map((child: ReactNode) => find(child, type)).find(Boolean) ?? null
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  return node.type === type ? (node as El) : find(node.props.children, type)
}

// Saves under this pen name and waits for the answer; gives back the error the form last set, the
// fifth state it asks for
const saveAs = async (penName: string) => {
  seeded.values = [penName]
  seeded.at = 0
  let tree = null as ReactNode
  const Probe = () => {
    tree = ProfileForm(props())
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  await find(tree, 'form')!.props.onSubmit!({ preventDefault: () => {} })
  return seeded.set[4]
}

const LIVE = '<div class="stack live" aria-live="polite">'

// Moderation's own tests write crisis language in ROT13 too, so none of it reads plainly here
const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

describe('ProfileForm', () => {
  it('says the note is open to everyone signed in, not just your groups', () => {
    const html = render()
    // firestore.rules lets any signed-in person read users/{uid}, note included
    expect(html).not.toMatch(/people in your groups/i)
    expect(html).toMatch(/<span id="note-hint" class="hint">Anyone signed in here can see this\./)
    expect(html).toMatch(/<textarea id="note"[^>]*aria-describedby="note-hint"/)
  })

  it('has its live region in place, empty, before anything is saved', () => {
    for (const html of [render(), render(() => undefined)]) {
      expect(html).toContain(`${LIVE}</div>`)
      expect(html).not.toMatch(/role="note"/)
    }
  })
})

// The hint for a pen name that holds crisis language says there are lines below, so they come with it
describe('a pen name that holds crisis language', () => {
  it('brings the crisis lines as it is typed', () => {
    const html = render(undefined, [rot13('v jnag gb qvr')])
    expect(html).toContain(PEN_NAME_HINTS.crisis)
    expect(html).toContain(`${LIVE}<aside class="crisis"`)
  })

  // The server's moderation can be newer than the site's: a tab left open across a deploy passes
  // a name the server then refuses for crisis language
  it('brings them when saveProfile refuses the name for it', async () => {
    const name = 'Quiet Heron'
    expect(checkPenName(name).ok).toBe(true)
    calls.saveProfile.mockRejectedValue(new Error('pen-name'))
    calls.problemOf.mockReturnValue('crisis')
    const error = await saveAs(name)
    const html = render(undefined, [name, undefined, undefined, undefined, error])
    expect(html).toContain(`<p class="error" role="alert">${PEN_NAME_HINTS.crisis}</p>`)
    expect(html).toContain(`${LIVE}<aside class="crisis"`)
  })

  it('leaves them out for a name the server refuses for anything else', async () => {
    calls.saveProfile.mockRejectedValue(new Error('pen-name'))
    calls.problemOf.mockReturnValue('taken')
    const error = await saveAs('Quiet Heron')
    const html = render(undefined, ['Quiet Heron', undefined, undefined, undefined, error])
    expect(html).toContain('<p class="error" role="alert">Someone already uses that pen name.</p>')
    expect(html).toContain(`${LIVE}</div>`)
    expect(html).not.toMatch(/role="note"/)
  })
})
