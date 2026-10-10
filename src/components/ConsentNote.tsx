import { setCountVisits, TELEMETRY_AVAILABLE, useCountVisits } from '../lib/telemetry'

// Asked once per device; nothing is counted until someone says yes. Changeable from "You".
export const ConsentNote = () => {
  const choice = useCountVisits()
  if (!TELEMETRY_AVAILABLE || choice !== null) return null

  return (
    <aside className="consent" aria-labelledby="consent-title">
      <p id="consent-title" className="pencil note">
        May we count visits?
      </p>
      <p className="hint">
        It shows us which pages are slow or confusing: page addresses and load times, never your name or anything you write. Nothing is used
        for ads.
      </p>
      <div className="row">
        <button type="button" className="act act--quiet act--wash" onClick={() => void setCountVisits(true)}>
          Count my visits
        </button>
        <button type="button" className="link-btn" onClick={() => void setCountVisits(false)}>
          No, thank you
        </button>
      </div>
    </aside>
  )
}
