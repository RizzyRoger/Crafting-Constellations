import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// The address a page is on now, or null once it has gone. Read after an await: a slow call, or a
// write held while offline, can outlast the visit, and the router's navigate still works after the
// page has gone, so going on from there would pull someone off the page they've chosen since
export const useCurrentPath = () => {
  const { pathname } = useLocation()
  const at = useRef<string | null>(pathname)
  useEffect(() => {
    at.current = pathname
    return () => {
      at.current = null
    }
  }, [pathname])
  return () => at.current
}
