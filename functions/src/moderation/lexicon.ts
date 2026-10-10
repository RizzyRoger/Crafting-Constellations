// AutoMod lexicon. Every pattern matches whole words on normalised text
// (see normalize.ts): lowercase, no apostrophes, leetspeak folded.
// Bump LEXICON_VERSION whenever a list changes; it is stored on queue items.

export const LEXICON_VERSION = 'lex-2026-10-10'

export type Category = 'slur' | 'harassment' | 'selfHarm' | 'spam' | 'personalInfo'

const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

// Slur stems, ROT13-encoded so the list does not render as plain text in the
// source or the client bundle. Matched as whole words with common suffixes.
const SLUR_STEMS = [
  'avttre', 'avttn', 'snttbg', 'snt', 'ergneq', 'xvxr', 'fcvp', 'puvax',
  'genaal', 'qlxr', 'jrgonpx', 'tbbx', 'cnxv', 'gbjryurnq', 'ornare',
].map(rot13)

export const SLUR = new RegExp(`\\b(?:${SLUR_STEMS.join('|')})(?:s|z|ed|ing|y)?\\b`, 'u')

// Abuse aimed at a person. Venting about illness ("this is so fucking hard")
// is deliberately not here.
export const HARASSMENT: RegExp[] = [
  /\b(?:go )?(?:kill|hang) (?:yo)?ur ?self\b/u,
  /\bkill ?yourself\b/u,
  /\bkys\b/u,
  /\b(?:you|u) should (?:just )?(?:die|be dead)\b/u,
  /\bgo die\b/u,
  /\bhope (?:you|u|she|he|they) (?:die|dies|get cancer|gets cancer|suffer|suffers)\b/u,
  /\b(?:you|u|she|he|they) deserves? (?:to die|to suffer|cancer)\b/u,
  /\bnobody (?:wants|likes|loves) (?:you|u)\b/u,
  /\bfuck (?:you|u|off)\b/u,
  /\b(?:you|u|youre|ur) (?:are |r )?(?:such |an? )?(?:\w+ )?(?:idiot|moron|loser|bitch|freak|pathetic|worthless|disgusting|piece of shit)\b/u,
  /\b(?:shut up|stfu) (?:and die|bitch)\b/u,
  /\b(?:cunt|whore|slut)s?\b/u,
]

// Crisis language. In groups this holds the post for a person to read and
// shows the author resources; in private messages it is delivered with
// resources for both people.
export const SELF_HARM: RegExp[] = [
  /\b(?:kill|hurt|harm|cut)(?:ing|s)? (?:myself|my self)\b/u,
  /\bkms\b/u,
  /\bunalive (?:myself|me)\b/u,
  /\bend(?:ing)? (?:it all|my (?:own )?life)\b/u,
  /\btak(?:e|ing) my (?:own )?life\b/u,
  /\b(?:wants?|wanting|wanted) to die\b/u,
  /\bwish (?:i|id) (?:was|were|could be) dead\b/u,
  /\bwish i (?:wasnt|werent|hadnt been) (?:alive|here|born)\b/u,
  /\b(?:dont|do not) want to (?:live|be alive|be here anymore|wake up|exist)\b/u,
  /\bno (?:reason|point) (?:to|in) (?:live|living|go on|going on)\b/u,
  /\bbetter off without me\b/u,
  /\bcant (?:go on|keep going)\b/u,
  /\bsuicid(?:e|al)\b/u,
  /\bself ?harm(?:ing)?\b/u,
  /\b(?:going to|gonna|want to|will) (?:overdose|od)\b/u,
]

// Links are held unless they point at these well-known support resources
export const LINK_ALLOWLIST = [
  'cancer.org',
  'cancer.gov',
  'cancercare.org',
  'macmillan.org.uk',
  'nhs.uk',
  'nih.gov',
  'mayoclinic.org',
  'who.int',
  '988lifeline.org',
  'samaritans.org',
  'findahelpline.com',
  'mind.org.uk',
  'nami.org',
  'mentalhealth.gov',
]

export const MAX_LINKS = 3

const TLDS = 'com|net|org|io|co|info|biz|xyz|ru|top|app|me|gg|ly|uk|gov|edu|us|ca|au|ie|int|link|site|online|shop|club'

export const LINK = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>()]+|\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/[^\\s<>()]*)?`,
  'gu',
)

export const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu

export const PHONE: RegExp[] = [
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/u,
  /\b0\d{4}\s?\d{6}\b/u,
  /\+\d[\d\s-]{8,14}\d\b/u,
]

// Crisis and support lines people should be able to share in groups
export const PHONE_ALLOWLIST = ['988', '18002738255', '8002738255', '116123', '741741', '08457909090']

export const FLOOD_CHAR = /(.)\1{19,}/u
export const FLOOD_WORD = /\b(\w+)(?: \1\b){7,}/u

// Pen names must not suggest credentials or staff: the licensed mark is the
// only credential signal in the product.
export const RESERVED_NAME_WORDS = [
  'dr', 'doctor', 'md', 'phd', 'lcsw', 'lpc', 'lmft', 'rn', 'np', 'psyd',
  'therapist', 'psychologist', 'psychiatrist', 'counselor', 'counsellor', 'nurse',
  'licensed', 'admin', 'administrator', 'moderator', 'mod', 'staff', 'official',
  'crafting', 'constellations',
]
