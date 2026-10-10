import type { ReactNode } from 'react'
import { Plate } from '../components/Plate'
import { APP_CHECK_ON } from '../lib/firebase'
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
      {APP_CHECK_ON && (
        // App Check hides the reCAPTCHA badge, so its terms ask for this line instead
        <p className="meta">
          Protected by reCAPTCHA. Google’s{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </a>{' '}
          and{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
            Terms of Service
          </a>{' '}
          apply.
        </p>
      )}
    </div>
  </div>
)
