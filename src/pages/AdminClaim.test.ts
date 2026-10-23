import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AdminClaim } from './AdminClaim'

const state = vi.hoisted(() => ({ error: null as string | null, asked: false }))

vi.mock('../auth/AuthProvider', () => ({ useMe: () => ({ claims: { admin: false }, refreshClaims: vi.fn() }) }))
vi.mock('../auth/moderator', () => ({ claimModerator: vi.fn() }))
vi.mock('../lib/callables', () => ({ bootstrapAdmin: vi.fn(), describeError: vi.fn() }))
vi.mock('../components/PageHead', () => ({ PageHead: () => null }))
// A server render can't press the button, so the refusal is seeded: it is the only state that starts as null
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  const useState = (initial: unknown) => {
    if (initial !== null || state.asked) return react.useState(initial)
    state.asked = true
    return react.useState(state.error)
  }
  return { ...react, useState }
})

const render = (error: string | null) => {
  state.error = error
  state.asked = false
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AdminClaim)))
}

describe('the moderator claim', () => {
  it('says out loud when the list doesn’t have you', () => {
    expect(render('You can’t do that here.')).toMatch(/<p class="error" role="alert">You can’t do that here\.<\/p>/)
    expect(render(null)).not.toMatch(/class="error"/)
  })
})
