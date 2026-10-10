import { moderate, type Context } from '@moderation'
import { useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import { describeError } from '../lib/callables'
import { insertMention, keptMentions, matchPeople, mentionQuery } from '../lib/mentions'
import type { Profile } from '../lib/types'
import { Blot } from '../wash/Blot'

export type Mentionable = Pick<Profile, 'id' | 'penName' | 'avatarSeed' | 'pigment'>

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
  // People who can read this place and can be pinged with @; leave out for no mentions
  people?: readonly Mentionable[]
  textRef?: Ref<HTMLTextAreaElement>
  // mentions: uids picked with @ whose name is still in the words
  onSubmit: (text: string, title: string | undefined, mentions: string[]) => Promise<void>
}

// Writing area on a baseline rule. The moderation check here is only a
// courtesy preview — the server decides. Crisis resources appear on the
// item itself once the server has read it. Typing @ offers the people who
// can read it; the server checks each pick again before anyone is pinged.
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
  people,
  textRef,
  onSubmit,
}: ComposerProps) => {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  // The @ whose list was closed (picked, Escape, or left), so it doesn't reopen as you type on
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(new Map())
  const field = useRef<HTMLTextAreaElement>(null)
  const nextCaret = useRef<number | null>(null)
  const id = useId()
  const listId = `${id}-people`
  const expanded = expandable && open
  const bar = shape === 'bar' || expandable

  const preview = useMemo(() => (text.trim() ? moderate(`${title}\n${text}`, { context }) : null), [text, title, context])
  const mayWait = preview?.action === 'hold' && !(context === 'private' && preview.crisis)

  const query = people && people.length > 0 ? mentionQuery(text, caret) : null
  const matches = query && query.start !== dismissed && people ? matchPeople(people, query.query) : []
  const listOpen = matches.length > 0
  const current = Math.min(active, matches.length - 1)

  // Put the caret back after a pick rewrites the text
  useLayoutEffect(() => {
    if (nextCaret.current === null || !field.current) return
    field.current.focus()
    field.current.setSelectionRange(nextCaret.current, nextCaret.current)
    nextCaret.current = null
  })

  const pick = (person: Mentionable) => {
    if (!query) return
    const next = insertMention(text, query.start, caret, person.penName)
    if (next.text.length > max) return
    setText(next.text)
    setCaret(next.caret)
    setDismissed(query.start)
    setPicked((m) => new Map(m).set(person.id, person.penName))
    nextCaret.current = next.caret
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(body, withTitle && title.trim() ? title.trim() : undefined, keptMentions(body, picked))
      setText('')
      setTitle('')
      setPicked(new Map())
      setDismissed(null)
      setOpen(false)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen && query) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((current + step + matches.length) % matches.length)
        return
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(matches[current])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(query.start)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
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
          ref={(node) => {
            field.current = node
            if (typeof textRef === 'function') textRef(node)
            else if (textRef) textRef.current = node
          }}
          id={`${id}-text`}
          rows={expanded ? Math.max(rows, 8) : bar ? 1 : rows}
          value={text}
          maxLength={max}
          placeholder={placeholder ?? (bar ? label : undefined)}
          aria-autocomplete={people ? 'list' : undefined}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen ? `${listId}-${current}` : undefined}
          onChange={(e) => {
            const value = e.target.value
            const at = e.target.selectionStart
            setText(value)
            setCaret(at)
            setActive(0)
            // A fresh @ always opens the list again
            if (mentionQuery(value, at)?.query === '') setDismissed(null)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={() => {
            if (expandable) setOpen(true)
          }}
          onBlur={() => {
            if (query) setDismissed(query.start)
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
      </div>
      {listOpen && (
        <ul className="mention-list" id={listId} role="listbox" aria-label="People to mention">
          {matches.map((person, i) => (
            <li
              key={person.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={i === current ? 'is-active' : undefined}
              // Keep focus in the text while choosing with the pointer
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(person)}
            >
              <Blot seed={person.avatarSeed || person.id} pigment={person.pigment} size={20} />
              <span>{person.penName}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="visually-hidden" aria-live="polite">
        {listOpen ? `${matches.length} ${matches.length === 1 ? 'person' : 'people'} to mention. Up and down to choose, Enter to pick.` : ''}
      </p>
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
