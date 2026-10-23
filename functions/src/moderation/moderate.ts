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
  SERVICE_PHONE,
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

// The host a browser would open: "evil.com\.nhs.uk" goes to evil.com, and
// "nhs.uk@evil.com" signs in to evil.com, so neither has an allowed host
const hostOf = (link: string) => {
  try {
    const url = new URL(/^https?:\/\//.test(link) ? link : `https://${link}`)
    return url.username || url.password ? '' : url.hostname.replace(/\.$/, '')
  } catch {
    return ''
  }
}

export const isAllowedLink = (link: string) => {
  const host = hostOf(link.toLowerCase())
  return LINK_ALLOWLIST.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

const firstMatch = (patterns: RegExp[], texts: string[]) =>
  patterns.flatMap((p) => texts.map((t) => t.match(p)?.[0])).find((m): m is string => Boolean(m))

// Emails and links in one pass, so an email's domain is not read as a link,
// and an @ inside a link is not read as an email ("https://nhs.uk@evil.com")
const LINK_OR_EMAIL = new RegExp(`(${EMAIL.source})|${LINK.source}`, 'gu')

const findLinks = (raw: string) => [...raw.matchAll(LINK_OR_EMAIL)].filter((m) => !m[1]).map((m) => m[0])

const isPersonalPhone = (match: string) => {
  const digits = match.replace(/\D/g, '')
  if (PHONE_ALLOWLIST.includes(digits)) return false
  return !digits.startsWith('0') || (digits.length >= 10 && digits.length <= 11 && !SERVICE_PHONE.test(digits))
}

const findPhone = (raw: string) => PHONE.flatMap((p) => raw.match(p) ?? []).find(isPersonalPhone)

export const moderate = (text: string, { context = 'public' }: { context?: Context } = {}): ModerationResult => {
  const { raw, words, joined, unmarked, folded, leet, squeezed, clauses } = normalize(text)
  const views = [...new Set([words, joined, unmarked, folded, squeezed, clauses])]
  const matches: Match[] = []

  // Only slurs read a final ! as an "i": elsewhere it would glue onto an
  // everyday word and hide what makes it everyday ("on holiday!")
  const slur = firstMatch([SLUR], [...views, leet])
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
