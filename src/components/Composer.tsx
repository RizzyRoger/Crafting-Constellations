import { moderate, type Context } from '@moderation'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { describeError } from '../lib/callables'

interface ComposerProps {
  label: string
  placeholder?: string
  submitLabel: string
  withTitle?: boolean
  rows?: number
  max?: number
  context?: Context
  disabled?: boolean
  shape?: 'rule' | 'bar'
  expandable?: boolean
  onSubmit: (text: string, title?: string) => Promise<void>
}

// Writing area on a baseline rule. The moderation check here is only a
// courtesy preview — the server decides. Crisis resources appear on the
// item itself once the server has read it.
export const Composer = ({
  label,
  placeholder,
  submitLabel,
  withTitle = false,
  rows = 3,
  max = 1000,
  context = 'public',
  disabled = false,
  shape = 'rule',
  expandable = false,
  onSubmit,
}: ComposerProps) => {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  const expanded = expandable && open
  const bar = shape === 'bar' || expandable

  const preview = useMemo(() => (text.trim() ? moderate(`${title}\n${text}`, { context }) : null), [text, title, context])
  const mayWait = preview?.action === 'hold' && !(context === 'private' && preview.crisis)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(body, withTitle && title.trim() ? title.trim() : undefined)
      setText('')
      setTitle('')
      setOpen(false)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className={`composer${bar ? ' composer--bar' : ''}${expanded ? ' composer--sheet' : ''}`} onSubmit={submit}>
      {withTitle && expanded && (
        <div className="field">
          <label htmlFor={`${id}-title`}>Title (optional)</label>
          <input id={`${id}-title`} type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={disabled} />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-text`} className={bar ? 'visually-hidden' : undefined}>
          {label}
        </label>
        <textarea
          id={`${id}-text`}
          rows={expanded ? Math.max(rows, 8) : bar ? 1 : rows}
          value={text}
          maxLength={max}
          placeholder={placeholder ?? (bar ? label : undefined)}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            if (expandable) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
          }}
          disabled={disabled}
        />
      </div>
      <div className="composer__foot">
        {!bar && (
          <span className="hint" aria-live="polite">
            {mayWait ? 'This may wait for a person to read it before others see it.' : ''}
          </span>
        )}
        <button type="submit" className={bar ? 'composer__send' : 'act act--wash'} disabled={disabled || sending || !text.trim()}>
          {sending ? 'Sending…' : submitLabel}
        </button>
      </div>
      {bar && mayWait && (
        <p className="hint" aria-live="polite">
          This may wait for a person to read it before others see it.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}
