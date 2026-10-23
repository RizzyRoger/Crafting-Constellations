import { tidyPenName } from '@moderation'

// Pen names are searched by penNameLower, which saveProfile keeps tidied (NFKC, straight
// apostrophes, one space between words) and lowercased. A search is built the same way: a phone
// types "Mary’s" with a curly apostrophe, which sorts past the stored "mary's" and finds no one
export const penNameSearchTerm = (typed: string) => tidyPenName(typed).toLowerCase()
