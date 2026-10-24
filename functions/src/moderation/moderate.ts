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
  TOLL_FREE_PHONE,
  TRUNK_ZERO,
  type Category,
} from './lexicon.js'
import { normalize, readAsLatin, type Normalized } from './normalize.js'

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

// Punctuation after a link ends the sentence, not the host: "I called
// https://www.samaritans.org, they were kind", "www.nhs.uk's advice",
// "«https://www.nhs.uk»"
const LINK_END = /(?:'s|[.,;:!?'"”*\]}|»])+$/u

// So does a dash, an emoji or an ideographic comma with no space after the
// link: "www.samaritans.org—they were kind". A browser would read on into the
// last part of the host, and no site has a name like that. Not when what
// follows could still reach a site through a dot, a login or an escaped dot:
// "https://www.nhs.uk—.evil.page", "https://www.nhs.uk—x@1249763466".
// Emoji leave out the digits, # and * that also count as one.
const LINK_BREAK = /[\u2013\u2014\u3001]|(?![#*\d])\p{Emoji}/u
const ANOTHER_SITE = /[.@%]/

const trimLink = (link: string) => {
  const trimmed = link.replace(LINK_END, '')
  const at = trimmed.search(LINK_BREAK)
  return at > 0 && !ANOTHER_SITE.test(trimmed.slice(at)) ? trimmed.slice(0, at).replace(LINK_END, '') : trimmed
}

const findLinks = (raw: string) =>
  [...raw.matchAll(LINK_OR_EMAIL)].filter((m) => !m[1]).map((m) => trimLink(m[0]))

const isPersonalPhone = (match: string) => {
  const digits = match.replace(/\D/g, '')
  if (PHONE_ALLOWLIST.includes(digits) || TOLL_FREE_PHONE.test(digits)) return false
  // A UK support line written for callers abroad: +44 808 808 0000 is 0808 808 0000
  if (match.startsWith('+44') && SERVICE_PHONE.test(digits.replace(/^440?/, '0'))) return false
  return !digits.startsWith('0') || (digits.length >= 10 && digits.length <= 11 && !SERVICE_PHONE.test(digits))
}

const findPhone = (raw: string) => {
  const dialled = raw.replace(TRUNK_ZERO, '$1 ')
  return PHONE.flatMap((p) => dialled.match(p) ?? []).find(isPersonalPhone)
}

const lettersOf = (n: Normalized) => [n.words, n.joined, n.unmarked, n.folded, n.squeezed, n.clauses]

export const moderate = (text: string, { context = 'public' }: { context?: Context } = {}): ModerationResult => {
  const normal = normalize(text)
  const { raw, digits, words } = normal
  // The word lists also read lookalike letters as the Latin ones they pass
  // for (a Cyrillic і in "kіll"); links, emails and numbers don't
  const latin = normalize(readAsLatin(text))
  const views = [...new Set([...lettersOf(normal), ...lettersOf(latin)])]
  const matches: Match[] = []

  // Only slurs read a final ! as an "i": elsewhere it would glue onto an
  // everyday word and hide what makes it everyday ("on holiday!")
  const slur = firstMatch([SLUR], [...new Set([...views, normal.leet, latin.leet])])
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
    // In any script's digits, as Arabic, Persian or Hindi keyboards type them
    const contact = digits.match(EMAIL)?.[1] ?? findPhone(digits)
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
