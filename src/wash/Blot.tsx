import { useEffect, useState, type CSSProperties } from 'react'
import { renderBlot } from './paint'
import { isPigment, pigmentVars, type Pigment } from './pigments'

interface BlotProps {
  seed: string
  pigment?: Pigment | string
  size?: number
  className?: string
}

// Avatar: a small wash blot seeded from the person's avatar seed. Decorative.
export const Blot = ({ seed, pigment = 'paynesBlue', size = 32, className = '' }: BlotProps) => {
  const safe: Pigment = isPigment(pigment) ? pigment : 'paynesBlue'
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void renderBlot(seed, safe, size).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [seed, safe, size])

  const { d, m } = pigmentVars(safe)
  const style = { width: size, height: size, '--d': d, '--m': m } as CSSProperties

  return src ? (
    <img className={`blot ${className}`} src={src} width={size} height={size} alt="" style={style} />
  ) : (
    <span className={`blot blot--pending ${className}`} style={style} aria-hidden="true" />
  )
}
