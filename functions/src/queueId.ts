// Firebase-free, kept apart so it can be unit tested

// Review-queue and notice id for a piece of writing: its path with each '/' as '~'.
// Each id escapes '%' and '~' first, so two paths never share an id (a post named
// 'P~comments~C' and comment C of post P). Auto-ids, slugs and uids hold neither,
// so their queue and notice ids are the same as before.
export const queueIdFor = (path: string) =>
  path
    .split('/')
    .map((id) => id.replaceAll('%', '%25').replaceAll('~', '%7E'))
    .join('~')
