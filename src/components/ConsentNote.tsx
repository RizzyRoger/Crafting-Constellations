import { useState } from 'react'
import { focusForNow, pageStart } from '../lib/focusForNow'
import { setCountVisits, TELEMETRY_AVAILABLE, useCountVisits } from '../lib/telemetry'

// Asked once per device; nothing is counted until someone says yes. Changeable from "You".
export const ConsentNote = () => {
  const choice = useCountVisits()
  const [said, setSaid] = useState('')
  if (!TELEMETRY_AVAILABLE) return null

  // An answer takes the note away with the button pressed, and the note is the last thing on the
  // page: focus goes to the page instead of falling out of it, and the answer is said. Where it is:
  // the landing page's heading is a long way up, and nothing on screen would say why it jumped there
  const answer = (yes: boolean) => {
    const page = pageStart(document)
    if (page) focusForNow(page, { preventScroll: true })
    setSaid(yes ? 'Saved. Visits on this device are counted.' : 'Saved. Nothing is counted.')
    void setCountVisits(yes)
  }

  return (
    <>
      {choice === null && (
        <aside className="consent" aria-labelledby="consent-title">
          <p id="consent-title" className="pencil note">
            May we count visits?
          </p>
          <p className="hint">
            It shows us which pages are slow or confusing: page addresses and load times. An address can hold account, group, post and chat
            ids and a group’s name (a private thread’s holds both people’s account ids), never your name or anything you write.
            Nothing is used for ads.
          </p>
          <div className="row">
            <button type="button" className="act act--quiet act--wash" onClick={() => answer(true)}>
              Count my visits
            </button>
            <button type="button" className="link-btn" onClick={() => answer(false)}>
              No, thank you
            </button>
          </div>
        </aside>
      )}
      {/* Mounted with the note and kept after it, so the answer is heard once the note has gone. At
          the top: left where it falls, under the full-height shell, it made the window scroll by 1px */}
      <p className="visually-hidden" role="status" style={{ top: 0 }}>
        {said}
      </p>
    </>
  )
}
