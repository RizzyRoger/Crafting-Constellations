import type { ReactNode } from 'react'
import { Plate } from '../components/Plate'
import { PORTRAIT } from '../wash/strokes'
import { Wash } from '../wash/Wash'

// Board 04's portrait sheet: wash above, ruled fields below
export const AuthLayout = ({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) => (
  <div className="auth">
    <Wash strokes={PORTRAIT} seed={404} className="auth__wash" duration={900} />
    <div className="auth__sheet stack" style={{ gap: 26 }}>
      <Plate link />
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="auth__title">{title}</h1>
        {lede && <p className="pencil note">{lede}</p>}
      </div>
      {children}
    </div>
  </div>
)
