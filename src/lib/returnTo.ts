// The page someone was opening when sign-in or a pen name came first: path, ?tab and all
export const hereOf = ({ pathname, search, hash }: { pathname: string; search: string; hash: string }) =>
  pathname + search + hash

const ORIGIN = 'https://here.invalid'

// Where to send them afterwards, read from history state. Only ever a page on this site:
// '//x', '/\x' and '/\t/x' all read as another site to the browser, so ask its URL parser
export const returnTo = (state: unknown, fallback = '/constellation') => {
  const from = (state as { from?: unknown } | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/')) return fallback
  try {
    return new URL(from, ORIGIN).origin === ORIGIN ? from : fallback
  } catch {
    return fallback
  }
}

// Where Verify's Continue and Later go: back to the page that asked for a confirmed email (see
// ConfirmEmail). Someone with no pen name yet chooses one first, and that page is carried on
export const afterVerify = (hasProfile: boolean, state: unknown): { to: string; state?: unknown } =>
  hasProfile ? { to: returnTo(state) } : { to: '/onboarding', state }
