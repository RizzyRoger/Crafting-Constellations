import { useEffect, useRef } from 'react'
import type { Stroke } from './field'
import { paintWash } from './paint'
import { paynesStops } from './pigments'

interface WashProps {
  strokes: readonly Stroke[]
  seed?: number
  granulation?: number
  streaks?: number
  duration?: number
  className?: string
}

// The commanding wash for a first viewport. Decorative; never holds content.
export const Wash = ({ strokes, seed = 29, granulation = 0.8, streaks = 0.38, duration = 1100, className = '' }: WashProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    return paintWash(ref.current, { stops: paynesStops(), strokes, seed, granulation, streaks, duration })
  }, [strokes, seed, granulation, streaks, duration])

  return <div ref={ref} className={`wash ${className}`} aria-hidden="true" />
}
