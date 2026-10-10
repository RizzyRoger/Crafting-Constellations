import { useEffect, useRef, type CSSProperties } from 'react'
import { paintWash, swatchOptions } from './paint'
import { pigmentStops, pigmentVars, type Pigment } from './pigments'

interface SwatchProps {
  pigment: Pigment
  density?: number
  loose?: boolean
  granulation?: number
  seed?: number
  className?: string
}

// A cut swatch bar: CSS gradient first frame, painted wash once the worker answers
export const Swatch = ({ pigment, density = 1, loose = false, granulation = 0.35, seed = 101, className = '' }: SwatchProps) => {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!ref.current) return
    return paintWash(ref.current, swatchOptions(pigmentStops(pigment), { seed, density, loose, granulation }))
  }, [pigment, density, loose, granulation, seed])

  const { d, m, t } = pigmentVars(pigment)
  const style = { '--d': d, '--m': m, '--t': t } as CSSProperties

  return <span ref={ref} className={`swatch ${className}`} style={style} aria-hidden="true" />
}
