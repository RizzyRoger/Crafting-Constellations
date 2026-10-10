import type { ReactNode } from 'react'

// A full-page pencil note for loading and empty states
export const Quiet = ({ children }: { children: ReactNode }) => (
  <div className="quiet" role="status">
    {children}
  </div>
)
