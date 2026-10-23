import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProfileForm } from './ProfileForm'

// The form's first render needs no Firebase; keep the SDK from starting in node
vi.mock('../lib/callables', () => ({ saveProfile: vi.fn(), problemOf: vi.fn(), describeError: vi.fn() }))

const render = (onSaved?: () => void) => renderToStaticMarkup(createElement(ProfileForm, { uid: 'u1', submitLabel: 'Save', onSaved }))

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
      expect(html).toMatch(/<div class="stack live" aria-live="polite"><\/div>/)
      expect(html).not.toMatch(/role="note"/)
    }
  })
})
