import type { ReactNode } from 'react'
import type { Stroke } from '../wash/field'
import { HEAD } from '../wash/strokes'
import { Wash } from '../wash/Wash'

interface PageHeadProps {
  title: ReactNode
  kicker?: ReactNode
  lede?: ReactNode
  strokes?: readonly Stroke[]
  seed?: number
  children?: ReactNode
}

// One wash owns the top of every page; the title and notes orbit it
export const PageHead = ({ title, kicker, lede, strokes = HEAD, seed = 61, children }: PageHeadProps) => (
  <header className="page-head">
    <Wash strokes={strokes} seed={seed} duration={900} />
    <div className="page-head__text">
      {kicker && <p className="code">{kicker}</p>}
      <h1>{title}</h1>
      {lede && <p className="lede pencil">{lede}</p>}
      {children}
    </div>
  </header>
)
