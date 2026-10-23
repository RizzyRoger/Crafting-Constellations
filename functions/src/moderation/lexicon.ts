// AutoMod lexicon. Every pattern matches whole words on normalised text
// (see normalize.ts): lowercase, no apostrophes, leetspeak folded.
// Bump LEXICON_VERSION whenever a list changes; it is stored on queue items.

export const LEXICON_VERSION = 'lex-2026-10-23'

export type Category = 'slur' | 'harassment' | 'selfHarm' | 'spam' | 'personalInfo'

const rot13 = (s: string) =>
  s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97))

// Slur stems, ROT13-encoded so the list does not render as plain text in the
// source or the client bundle. Matched as whole words with common suffixes.
const SLUR_STEMS = [
  'avttre', 'avttn', 'snttbg', 'snt', 'ergneq', 'xvxr', 'puvax',
  'genaal', 'qlxr', 'jrgonpx', 'tbbx', 'cnxv', 'gbjryurnq',
].map(rot13)

// Stems that take only a plural: with -y, -ed or -ing they spell everyday
// words ("… food since chemo", "… apple cake")
const PLURAL_STEMS = ['fcvp', 'ornare'].map(rot13)

export const SLUR = new RegExp(
  `\\b(?:(?:${SLUR_STEMS.join('|')})(?:s|z|ed|ing|y)?|(?:${PLURAL_STEMS.join('|')})(?:s|z)?)\\b`,
  'u',
)

// How a family hopes someone's death will come: "I hope he dies peacefully at
// home", "she deserves to die with dignity". Only for he, she or they: wished
// on "you" it is abuse, whatever follows. Any space, as the clauses view puts
// "dies, peacefully" on two lines.
const GENTLY =
  'peacefully|quietly|calmly|comfortably|painlessly|gently|at home|in peace|with dignity|' +
  'without (?:pain|suffering)|in (?:his|her|their) sleep|surrounded by'

// Cancer as a wish, not the care that comes with it: "you deserve cancer
// support too", "I hope he gets cancer treatment soon", "cancer-free". Only a
// space, as the clauses view puts "cancer. Support …" on two lines.
const CANCER_HELP =
  'care|support|treatments?|therapy|drugs?|meds|medication|nurses?|doctors?|specialists?|services?|research|' +
  'charity|charities|centres?|centers?|clinics?|team|ward|unit|screening|scans?|tests?|checks?|trials?|help|' +
  'advice|info|information|counsell?ing|grants?|benefits|funding|insurance|leave|free|clear'
const CANCER = `cancer\\b(?! (?:${CANCER_HELP})\\b)`

// What nobody wants for you, said kindly: "nobody wants you to go through
// this alone", "… to have to face this", "… to feel like a burden". Anything
// else nobody wants you to do or feel ("to come back", "to feel welcome", "to
// think you matter") is still abuse.
const SPARED =
  'to (?:have to )?(?:feel(?! (?:welcome|wanted|loved|safe|happy|better|at home|included)\\b)|go through|suffer|' +
  'struggle|worry|cope|face|carry|hurt|give up|blame|apologi[sz]e|push|deal with|leave|do (?:this|it) alone|' +
  'think (?:youre|you are) (?:a burden|alone|to blame|on your own)|' +
  'be (?:alone|on your own|lonely|scared|afraid|sad|ashamed|sorry|in pain))'
// "Nobody loves you like your mum does", "… more than I do", "… any less for
// crying" says someone does. Only after likes or loves: "nobody wants you
// like …" is not a comparison.
const LOVED_AS =
  'like (?:a|an|my|our|his|her|their|your|i|we|he|she|they|family|mum|mom|mama|mummy|mommy|dad|daddy)|' +
  'more than|as much as(?! you think)|any less'

// One word may sit between "you" and an insult ("you stupid idiot"), but not
// one that turns it round: "you are not worthless", "when you feel worthless",
// "are you a control freak like me?"
const NOT_AN_INSULT = 'not|never|no|arent|werent|aint|feel|feels|felt|feeling|control'

// Abuse aimed at a person. Venting about illness ("this is so fucking hard")
// is deliberately not here.
export const HARASSMENT: RegExp[] = [
  /\b(?:go )?(?:kill|hang) (?:yo)?ur ?self\b/u,
  /\bkill ?yourself\b/u,
  /\bkys\b/u,
  /\b(?:you|u) should (?:just )?(?:die|be dead)\b/u,
  /\bgo die\b/u,
  new RegExp(`\\bhope (?:you|u) (?:die|dies|gets? ${CANCER}|suffer|suffers)\\b`, 'u'),
  new RegExp(`\\bhope (?:she|he|they) (?:gets? ${CANCER}|suffers?|dies?\\b(?!\\s(?:${GENTLY})\\b))\\b`, 'u'),
  new RegExp(`\\b(?:you|u) deserves? (?:to die|to suffer|${CANCER})\\b`, 'u'),
  new RegExp(`\\b(?:she|he|they) deserves? (?:${CANCER}|to suffer|to die\\b(?!\\s(?:${GENTLY})\\b))\\b`, 'u'),
  new RegExp(`\\bnobody wants (?:you|u)\\b(?! (?:${SPARED})\\b)`, 'u'),
  new RegExp(`\\bnobody (?:likes|loves) (?:you|u)\\b(?! (?:${SPARED}|${LOVED_AS})\\b)`, 'u'),
  /\bfuck (?:you|u|off)\b/u,
  // "You can bitch and moan here", "if you freak out": the verbs, not the
  // insults. After "a" or "such" they are the insults, whatever follows.
  new RegExp(
    `\\b(?:you|u|youre|ur) (?:are |r )?(?:such |an? )?(?:(?!(?:${NOT_AN_INSULT})\\b)\\w+ )?` +
      '(?:idiot|moron|loser|(?<=\\b(?:an?|such) (?:\\w+ )?)(?:bitch|freak)|' +
      'bitch(?! (?:and (?:moan|whine|complain|vent)|about)\\b)|freak(?! out\\b)|' +
      'pathetic|worthless|disgusting|piece of shit)\\b',
    'u',
  ),
  /\b(?:shut up|stfu) (?:and die|bitch)\b/u,
  /\b(?:cunt|whore|slut)s?\b/u,
]

// What follows an everyday "can't go on", "don't want to live" or "don't want
// to wake up": somewhere to go or live, someone to wake. Crisis language runs
// on into how it feels ("like this", "anymore") or ends the clause, so the
// lists stop short of "this way", "in my body", "a world without him",
// "with my husband gone" and "the next day".
const DETERMINER = 'a|an|the|that|these|those|my|our|his|her|their|your'
const FAMILY =
  'mum|mom|mummy|mommy|mother|dad|daddy|father|parents|baby|kids?|children|husband|wife|partner|son|daughter|' +
  'brother|sister|gran|granny|grandma|grandad|granddad|grandpa|nan|nana'
const OUTING =
  'holidays?|vacations?|trips?|walks?|rides?|dates?|tours?|cruises?|leave|chemo|treatment|about|' +
  '(?:mon|tues|wednes|thurs|fri|satur|sun)days?|weekends?'
// Day names as people shorten them: "can't go on Tues". "Sat" is also
// sitting: "sat here alone", "sat crying", "sat quietly", "sat numb", "sat
// the whole night" are how it feels. "Sat morning" and "Sat early" are the day.
const SITTING =
  'here|there|alone|and|in|on|at|by|with|next|beside|around|about|up|down|outside|inside|all|every|for|like|' +
  'still|numb|the (?:whole|entire)|(?!(?:morn|even)ing\\b)\\w+ing|(?!(?:early|only|july)\\b)\\w+ly'
const SHORT_DAY = `mon|tues?|weds?|thu(?:rs?)?|fri|sun|sat(?! (?:${SITTING})\\b)`
// Other things to go on: "planes", "school trips", "Facebook"
const GO_ON = 'planes?|flights?|trains?|buses|boats?|ferry|ferries|school trips?|facebook|instagram|social media'
// Something to be put on: "can't go on morphine yet". A verb or an "I" after
// it starts a new sentence ("… morphine isn't helping", "… its too much"),
// and "like this", "anymore", "much longer", "forever" or "for the rest of my
// life" is how it feels. "… the rest of his life" is still a plan for him.
const TREATMENT = 'morphine|steroids|oxygen|dialysis|radiotherapy|immunotherapy|hormone therapy'
const REST_OF_LIFE = 'the rest of (?:my|our) li(?:fe|ves)'
const NEW_SENTENCE =
  'i|im|ive|id|its|thats|is|isnt|are|arent|was|wasnt|were|werent|has|hasnt|have|havent|does|doesnt|did|didnt|' +
  'will|wont|would|wouldnt|can|cant|could|couldnt|makes?|keeps?|feels?|hurts?|takes?|aint'
const PLAN =
  `${DETERMINER}|this|${OUTING}|${SHORT_DAY}|${GO_ON}|any (?:${OUTING}|${GO_ON})|` +
  `(?:${TREATMENT})(?! (?:${NEW_SENTENCE}|like|(?:any|no) ?more|(?:much |any |no )?longer|for ?ever|` +
  `(?:for )?${REST_OF_LIFE})\\b)`
// "Going in" is going in to a ward or to work ("in and out of hospital", "in
// every day"); "in this pain" and "into another day" or "into every day" are
// how it feels. Going "for" is only to an appointment: "for much longer" and
// "for nothing" are how it feels.
const APPOINTMENT = 'scans?|tests?|bloods?|blood tests?|appointments?|check ?ups?|chemo|treatment|radiotherapy|dialysis'
const DIRECTION =
  'to|back|out|in (?:and|to|for|every)|' +
  'into(?! (?:another|tomorrow|(?:each|every|a new|the next) day|the (?:night|dark|future))\\b)|' +
  'up|down|upstairs|downstairs|round|around|over|there|home|' +
  `for (?:(?:${DETERMINER}) )?(?:${APPOINTMENT})|at (?:this|that|the) (?:pace|rate|speed)`
// Living "in a tiny flat" is a place; "in the pain" is how it feels, even
// with a word between: "in a cruel world", "in a lot of pain". "Live on" is
// also carrying on living, so only "on my own", and not "… without him" or
// "… anymore".
const FEELING = 'world|body|constant|pain|dark|darkness|hell|nightmare|misery|agony|fear|shadows?'
const PLACE =
  'far|near|nearby|close|there|abroad|alone|together|next (?:door|to)|' +
  '(?:on (?:my|our) own|by (?:myself|ourselves))(?! (?:any ?more|any longer|without|like|in)\\b)|' +
  'by (?:the )?(?:sea|seaside|coast|beach|river)|' +
  `in (?:a|an|the|that|those|our|his|her|their)(?! (?:\\w+ (?:of )?)?(?:${FEELING})\\b)|` +
  `with (?:(?:${DETERMINER}) )?(?:${FAMILY})(?! (?:gone|dead)\\b)`
// A time to wake, as it reads once leetspeak is folded: "5am" reads "sam",
// "6.30am" "6 eoam". "At all" and "in the morning" are how it feels, and so
// is waking in hospital "again", as people say it after an attempt.
const DIGIT = '[\\doieast]'
const WAKING =
  `at ${DIGIT}{1,2}(?: ${DIGIT}{2})? ?(?:am|pm|oclock)|` +
  'in (?:(?:a|the) )?(?:hospital|hospice|ward|icu|intensive care|(?:care|nursing) home)(?! (?:\\w+ )?again\\b)'
const SOMEONE = `${DETERMINER}|${FAMILY}|him|them|you|us|everyone|everybody|anyone|anybody`

// A determiner that starts how long or how it feels, not where: "the same
// way", "this much longer", "an hour longer", "the rest of my life". "A day
// trip" is still a trip.
const SPAN = 'day|night|morning|week|month|year|hour|minute|moment|second'
const HOW_LONG =
  '(?:the|this|that) (?:same )?way|(?:this|that) (?:much|any ?more|any longer)|' +
  `a single (?:${SPAN})|an? (?:${SPAN}) (?:more|longer)|${REST_OF_LIFE}`

// "To" as people text it: "want 2 …", "want2…". Only where a pattern
// already reads "to": a 2 anywhere else is a count.
const TO = '(?: to | ?2 ?)'

// Crisis language. In groups this holds the post for a person to read and
// shows the author resources; in private messages it is delivered with
// resources for both people.
export const SELF_HARM: RegExp[] = [
  /\b(?:(?:kill|hurt|harm)(?:ing|s)?|harmed|cut(?:t?ing|s)?) (?:myself|my self)\b/u,
  /\bkms\b/u,
  /\bunalive (?:myself|me)\b/u,
  /\bend(?:ing)? (?:it all|my (?:own )?life)\b/u,
  /\btak(?:e|ing) my (?:own )?life\b(?! (?:back|savings)\b)/u,
  new RegExp(`\\b(?:(?:wants?|wanting|wanted)${TO}|wanna )die\\b`, 'u'),
  /\bwish (?:i|id) (?:was|were|could be) dead\b/u,
  /\bwish i (?:wasnt|werent|hadnt been) (?:alive|here|born)\b/u,
  new RegExp(`\\b(?:dont|do not) (?:want${TO}|wanna )(?:be alive|be here anymore|exist)\\b`, 'u'),
  new RegExp(`\\b(?:dont|do not) (?:want${TO}|wanna )live\\b(?! (?:${PLACE})\\b)`, 'u'),
  new RegExp(
    `\\b(?:dont|do not) (?:want${TO}|wanna )wake up\\b(?! (?!the next\\b|(?:${HOW_LONG})\\b)(?:${SOMEONE}|early|${WAKING})\\b)`,
    'u',
  ),
  new RegExp(`\\bno (?:reason|point)(?:${TO}| in )(?:live|living|go on|going on)\\b`, 'u'),
  /\bbetter off without me\b/u,
  new RegExp(`\\b(?:cant|cannot|can not) go on\\b(?! (?!(?:${HOW_LONG})\\b)(?:${PLAN})\\b)`, 'u'),
  new RegExp(`\\b(?:cant|cannot|can not) keep going\\b(?! (?!(?:${HOW_LONG})\\b)(?:${DETERMINER}|this|${DIRECTION})\\b)`, 'u'),
  /\bsuicid(?:e|al)\b/u,
  /\bself ?harm(?:ing)?\b/u,
  new RegExp(`\\b(?:(?:going|want)${TO}|gonna |wanna |will )(?:overdose|od)\\b`, 'u'),
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

// A bare name ending in one of these is a link ("cheap-pills.xyz")
const TLDS = 'com|net|org|io|biz|xyz|ru|gg|ly|uk|gov|edu|au|eu|cn|cc|pw|ws|su|tk|ga|cf|gq'

// These are also words (or a dose), so a bare name ending in one is a link
// only with a path: "Thanks all.Me and mum" is a missing space,
// "evil.shop/deal" is a link
const WORD_TLDS = 'me|us|co|info|top|app|ca|link|site|online|shop|club|int|ie|de|in|to|ml'

const HOST = '\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*'

export const LINK = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>()]+|` +
    `${HOST}\\.(?:${TLDS}|${WORD_TLDS})\\/[^\\s<>()]*|` +
    `${HOST}\\.(?:${TLDS})\\b`,
  'gu',
)

// The last label starts with a letter, so "tomorrow@10.15" is a time. Read
// only from where an address can start: tried from every letter of a long
// word, it took time with the square of its length.
export const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z][\w-]*/gu

// Global: a crisis line earlier in the text must not hide a number after it
export const PHONE: RegExp[] = [
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/gu,
  // UK and Australian numbers in their usual groupings: 020 7946 0958,
  // 07700 900 123, (02) 9876 5432
  /(?:\(0\d{1,4}\)|\b0\d{1,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/gu,
  /\+\d[\d\s-]{8,14}\d\b/gu,
]

// The trunk 0 kept in brackets after a country code, for callers at home:
// "+44 (0)7700 900123". Numbers are read as dialled from abroad, without it.
// Spaces round it don't count: "+44  (0)  7700 900123".
export const TRUNK_ZERO = /(\+\d{1,3})\s*\(\s*0\s*\)\s*/gu

// Crisis and support lines people should be able to share in groups
export const PHONE_ALLOWLIST = ['988', '18002738255', '8002738255', '116123', '741741', '08457909090']

// A number that starts with 0 is a person's at 10 or 11 digits, unless it is
// on the UK ranges where support lines live: freephone 080…, and 03, 08 and
// 09 at 11 digits. Australian 03 and 08 landlines have 10.
export const SERVICE_PHONE = /^(?:080\d*|0[389]\d{9})$/

// US and Canadian toll-free numbers, with or without the 1: never a
// person's line
export const TOLL_FREE_PHONE = /^1?8(?:00|33|44|55|66|77|88)\d{7}$/

// Whitespace doesn't count: a run of spaces or tabs (pasted columns) collapses
// on screen
export const FLOOD_CHAR = /(\S)\1{19,}/u
export const FLOOD_WORD = /\b(\w+)(?: \1\b){7,}/u

// Pen names must not suggest credentials or staff: the licensed mark is the
// only credential signal in the product.
export const RESERVED_NAME_WORDS = [
  'dr', 'doctor', 'md', 'phd', 'lcsw', 'lpc', 'lmft', 'rn', 'np', 'psyd',
  'therapist', 'psychologist', 'psychiatrist', 'counselor', 'counsellor', 'nurse',
  'licensed', 'admin', 'administrator', 'moderator', 'mod', 'staff', 'official',
  'crafting', 'constellations',
]
