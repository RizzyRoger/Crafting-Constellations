import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'

// For sign-in: say the account was paused on the page the pause sent them to, for as long as it
// stays open, then forget it. The next person to open sign-in in this tab may be someone else
export const usePausedNote = () => {
  const { paused, forgetPause } = useAuth()
  const [said, setSaid] = useState(paused)
  useEffect(() => {
    if (!paused) return
    setSaid(true)
    forgetPause()
  }, [paused, forgetPause])
  return paused || said
}
