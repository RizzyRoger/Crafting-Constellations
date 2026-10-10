import {
  EMAIL,
  FLOOD_CHAR,
  FLOOD_WORD,
  HARASSMENT,
  LEXICON_VERSION,
  LINK,
  LINK_ALLOWLIST,
  MAX_LINKS,
  PHONE,
  PHONE_ALLOWLIST,
  SELF_HARM,
  SLUR,
  type Category,
} from './lexicon.js'
import { normalize } from './normalize.js'

export type Context = 'public' | 'private'

export interface Match {
  category: Category
  term: string
}

export interface ModerationResult {
  action: 'publish' | 'hold'
  crisis: boolean
  categories: Category[]
  matches: Match[]
  version: string
}

const hostOf = (link: string) =>
  link
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0]
    .replace(/\.$/, '')

export const isAllowedLink = (link: string) => {
  const host = hostOf(link.toLowerCase())
  return LINK_ALLOWLIST.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

const firstMatch = (patterns: RegExp[], texts: string[]) =>
  patterns.flatMap((p) => texts.map((t) => t.match(p)?.[0])).find((m): m is string => Boolean(m))

const findLinks = (raw: string) => raw.replace(EMAIL, ' ').match(LINK) ?? []

const findPhone = (raw: string) =>
  PHONE.map((p) => raw.match(p)?.[0] ?? '').find((m) => m !== '' && !PHONE_ALLOWLIST.includes(m.replace(/\D/g, '')))

export const moderate = (text: string, { context = 'public' }: { context?: Context } = {}): ModerationResult => {
  const { raw, words, joined, unmarked } = normalize(text)
  const views = [...new Set([words, joined, unmarked])]
  const matches: Match[] = []

  const slur = firstMatch([SLUR], views)
  if (slur) matches.push({ category: 'slur', term: slur })

  const harassment = firstMatch(HARASSMENT, views)
  if (harassment) matches.push({ category: 'harassment', term: harassment })

  const selfHarm = firstMatch(SELF_HARM, views)
  if (selfHarm) matches.push({ category: 'selfHarm', term: selfHarm })

  const links = findLinks(raw)
  const outside = links.filter((link) => !isAllowedLink(link))
  if (outside.length > 0) matches.push({ category: 'spam', term: outside[0] })
  else if (links.length > MAX_LINKS) matches.push({ category: 'spam', term: `${links.length} links` })

  const flood = raw.match(FLOOD_CHAR)?.[0] ?? words.match(FLOOD_WORD)?.[0]
  if (flood) matches.push({ category: 'spam', term: flood.slice(0, 24) })

  if (context === 'public') {
    const contact = raw.match(EMAIL)?.[0] ?? findPhone(raw)
    if (contact) matches.push({ category: 'personalInfo', term: contact })
  }

  const categories = [...new Set(matches.map((m) => m.category))]
  return {
    action: categories.length > 0 ? 'hold' : 'publish',
    crisis: categories.includes('selfHarm'),
    categories,
    matches,
    version: LEXICON_VERSION,
  }
}
