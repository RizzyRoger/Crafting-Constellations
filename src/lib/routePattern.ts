// The deepest matched route path (/groups/:groupId/posts/:postId), never the
// real address: ids and group names stay out of analytics. App routes are absolute.
export const routePattern = (paths: (string | undefined)[]) => {
  const deepest = paths.filter((path): path is string => Boolean(path)).at(-1)
  if (!deepest) return '/'
  return deepest === '*' ? '/*' : deepest
}
