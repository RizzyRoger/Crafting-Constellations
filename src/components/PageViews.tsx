import { useEffect, useRef } from 'react'
import { matchRoutes, useLocation, type RouteObject } from 'react-router-dom'
import { routePattern } from '../lib/routePattern'
import { trackPage } from '../lib/telemetry'

// One page_view per address change, reported as the route pattern
export const PageViews = ({ routes }: { routes: RouteObject[] }) => {
  const { pathname } = useLocation()
  // StrictMode runs effects twice in development; count each address once
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    trackPage(routePattern((matchRoutes(routes, pathname) ?? []).map((m) => m.route.path)))
  }, [routes, pathname])

  return null
}
