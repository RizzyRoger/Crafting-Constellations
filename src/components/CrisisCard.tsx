import { useId } from 'react'

// Calm, non-clinical resources. Shown to the writer when crisis language is
// detected, and to both people in a private thread. Never a substitute for care.

type Audience = 'writer' | 'reader'

export const CrisisCard = ({ audience = 'writer', held = false }: { audience?: Audience; held?: boolean }) => {
  const id = useId()
  return (
  <aside className="crisis" aria-labelledby={id} role="note">
    <h2 id={id}>{audience === 'writer' ? 'If you need someone right now' : 'If they might be in danger'}</h2>
    <p className="pencil note">
      {audience === 'writer'
        ? 'What you wrote sounds heavy. If you might act on thoughts of ending your life, please contact emergency services now.'
        : 'This message mentions something painful. If you think they may be in danger, help them reach emergency services or one of these lines.'}
    </p>
    <ul>
      <li>
        <strong>US:</strong> call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline)
      </li>
      <li>
        <strong>UK &amp; Ireland:</strong> Samaritans, <a href="tel:116123">116 123</a>
      </li>
      <li>
        <strong>Elsewhere:</strong>{' '}
        <a href="https://findahelpline.com" target="_blank" rel="noreferrer">
          findahelpline.com
        </a>
      </li>
      <li>
        <strong>Emergency:</strong> 911 (US), 999 (UK), 112 (EU)
      </li>
    </ul>
    <p className="meta">
      {held
        ? 'A person on the team will read what you wrote before others see it. This page is not a substitute for care.'
        : 'Crafting Constellations is not a crisis service or a substitute for care.'}
    </p>
  </aside>
  )
}
