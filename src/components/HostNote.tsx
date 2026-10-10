import type { ReactNode } from 'react'

// A short note for a room that has no writing yet
export const HostNote = ({
  children,
  action,
}: {
  children?: ReactNode
  action?: { label: string; onClick: () => void }
}) => (
  <div className="host">
    {children ? <div className="host__copy">{children}</div> : null}
    {action ? (
      <button type="button" className="link-btn" onClick={action.onClick}>
        {action.label}
      </button>
    ) : null}
  </div>
)
