import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// An error lands after a press (Join, Leave, Accept, Start chat…), away from where focus is. A bare
// paragraph is never read out, so a screen-reader user hears nothing went wrong: every element the
// site styles as an error is an alert, as Report, SignIn and ProfileForm have it
const SRC = new URL('../', import.meta.url)

const sources = (readdirSync(SRC, { recursive: true }) as string[]).filter((file) => file.endsWith('.tsx'))

// Each opening tag styled as an error, with the file it's in
const errors = sources.flatMap((file) =>
  [...readFileSync(new URL(file, SRC), 'utf8').matchAll(/<[a-z]+\b[^<>]*\bclassName="error"[^<>]*>/g)].map(([tag]) => ({ file, tag })),
)

describe('Errors on the site', () => {
  it('are found where the site shows them', () => {
    expect(errors.map((e) => e.file)).toEqual(expect.arrayContaining(['pages/Group.tsx', 'pages/Chat.tsx', 'pages/Admin.tsx']))
  })

  it('are all announced', () => {
    expect(errors.filter((e) => !e.tag.includes('role="alert"'))).toEqual([])
  })
})
