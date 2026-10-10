import { splitMentions } from '@moderation'
import { Fragment } from 'react'
import type { Content } from '../lib/types'

interface MentionTextProps {
  text: string
  // From the server, on published writing only: a name is marked once it really pinged someone
  mentioned?: Content['mentioned']
  me: string
  className?: string
}

// Writing with @names drawn as a pencil underline; your own name a little heavier
export const MentionText = ({ text, mentioned, me, className = 'voice' }: MentionTextProps) => (
  <p className={className}>
    {splitMentions(text, mentioned ?? []).map((segment, i) =>
      segment.uid ? (
        <span key={i} className={segment.uid === me ? 'mention mention--me' : 'mention'}>
          {segment.text}
        </span>
      ) : (
        <Fragment key={i}>{segment.text}</Fragment>
      ),
    )}
  </p>
)
