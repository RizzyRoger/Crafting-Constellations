import { readdirSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The site bundles src/ and this folder (through @moderation), and it has to
// load on Safari 15.4 and later: iPhones and iPads that stop at iOS 15, and
// iOS 16.0 to 16.3. Safari can't read a lookbehind before 16.4, or the v flag
// before 17, and the build can't rewrite either, so one anywhere in this code
// leaves the whole site blank, crisis resources and all. Older Safari throws
// when the pattern is built, so one inside a function counts too.
const ROOT = new URL('../../../', import.meta.url)
const FOLDERS = ['src/', 'functions/src/moderation/']

const sources = FOLDERS.flatMap((folder) =>
  (readdirSync(new URL(folder, ROOT), { recursive: true }) as string[])
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !/\.test\.[cm]?[jt]sx?$/.test(file))
    .map((file) => `${folder}${file}`),
)

// "(?<=" or "(?<!" with the bracket not escaped
const LOOKBEHIND = /(?:^|[^\\])(?:\\\\)*\(\?<[=!]/

const nodesIn = (node: ts.Node): ts.Node[] => [node, ...node.getChildren().flatMap(nodesIn)]

const isRegExpCall = (node: ts.Node) =>
  (ts.isNewExpression(node) || ts.isCallExpression(node)) && node.expression.getText() === 'RegExp'

// What older Safari can't read, and where: in a regular expression literal, in
// a string a pattern is built from, or in the flags given to RegExp
const unreadable = (file: string, text: string) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  return nodesIn(source).flatMap((node) => {
    const at = `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
    if (ts.isRegularExpressionLiteral(node)) {
      const end = node.text.lastIndexOf('/')
      return [
        ...(LOOKBEHIND.test(node.text.slice(1, end)) ? [`${at} lookbehind`] : []),
        ...(node.text.slice(end).includes('v') ? [`${at} v flag`] : []),
      ]
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      return LOOKBEHIND.test(node.text) ? [`${at} lookbehind`] : []
    }
    if (isRegExpCall(node)) {
      const flags = (node as ts.NewExpression | ts.CallExpression).arguments?.[1]
      return flags && ts.isStringLiteralLike(flags) && flags.text.includes('v') ? [`${at} v flag`] : []
    }
    return []
  })
}

describe('Patterns in code the site loads', () => {
  it('are read from every file the site bundles', () => {
    expect(sources).toEqual(
      expect.arrayContaining(['src/main.tsx', 'src/lib/penNameSearch.ts', 'functions/src/moderation/normalize.ts']),
    )
    expect(sources.filter((file) => file.includes('.test.'))).toEqual([])
  })

  it('are caught when older Safari could not read them', () => {
    const code = [
      'const a = /(?<=x)y/u',
      "const b = new RegExp(`(?<!${a})y`, 'gu')",
      "const c = '(?<=' + 'x'",
      'const d = /[x]/v',
      "const e = RegExp('x', 'v')",
      // An escaped bracket, a named group and a lookahead are fine
      String.raw`const f = /\(?<=x(?<name>y)(?=z)(?!w)/u`,
    ].join('\n')
    expect(unreadable('probe.ts', code)).toEqual([
      'probe.ts:1 lookbehind',
      'probe.ts:2 lookbehind',
      'probe.ts:3 lookbehind',
      'probe.ts:4 v flag',
      'probe.ts:5 v flag',
    ])
  })

  it('use no lookbehind and no v flag', () => {
    expect(sources.flatMap((file) => unreadable(file, readFileSync(new URL(file, ROOT), 'utf8')))).toEqual([])
  })
})
