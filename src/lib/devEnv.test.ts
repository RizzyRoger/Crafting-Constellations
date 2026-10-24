import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from 'vite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repo = (file: string) => new URL(`../../${file}`, import.meta.url)

// Every key someone can put in .env.local: the template lists them
const KEYS = [...readFileSync(repo('.env.example'), 'utf8').matchAll(/^(VITE_\w+)=/gm)].map((match) => match[1])

// A real project's .env.local, with the NUC's local-backend switch on (README, "On the site")
const live = (key: string) => (key === 'VITE_USE_EMULATORS' ? 'false' : key === 'VITE_LOCAL_BACKEND' ? 'true' : `live-${key}`)

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dev-env-'))
  copyFileSync(repo('.env.development'), join(dir, '.env.development'))
  writeFileSync(join(dir, '.env.local'), KEYS.map((key) => `${key}=${live(key)}\n`).join(''))
  // Vite lets the shell's VITE_ variables beat every file; keep this machine's out of it
  Object.keys(process.env)
    .filter((key) => key.startsWith('VITE_'))
    .forEach((key) => vi.stubEnv(key, undefined))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('.env.development', () => {
  it('keeps `npm run dev` on the emulators, callables included, whatever .env.local holds', () => {
    const env = loadEnv('development', dir)
    expect(env.VITE_USE_EMULATORS).toBe('true')
    expect(env.VITE_LOCAL_BACKEND).toBe('false')
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe('demo-crafting-constellations')
  })

  // A mode file only wins over .env.local for the keys it sets
  it.each(KEYS)('sets %s, so .env.local can\'t reach `npm run dev`', (key) => {
    expect(loadEnv('development', dir)[key]).not.toBe(live(key))
  })

  it('leaves builds and `npm run dev:live` reading .env.local', () => {
    expect(loadEnv('production', dir).VITE_LOCAL_BACKEND).toBe('true')
    expect(loadEnv('live', dir).VITE_LOCAL_BACKEND).toBe('true')
  })

  it('turns local-backend mode on for the emulators only from .env.development.local', () => {
    writeFileSync(join(dir, '.env.development.local'), 'VITE_LOCAL_BACKEND=true\n')
    const env = loadEnv('development', dir)
    expect(env.VITE_LOCAL_BACKEND).toBe('true')
    expect(env.VITE_USE_EMULATORS).toBe('true')
  })
})
