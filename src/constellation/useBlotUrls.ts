import { useEffect, useState } from 'react'
import type { Profile } from '../lib/types'
import { renderBlot } from '../wash/paint'
import { isPigment } from '../wash/pigments'

// Wash-blot data URLs for SVG <image> nodes, filled in as the worker paints them
export const useBlotUrls = (people: Profile[], size: number) => {
  const [urls, setUrls] = useState<Record<string, string>>({})

  const key = people.map((p) => `${p.id}:${p.avatarSeed}:${p.pigment}`).join('|')

  useEffect(() => {
    let live = true
    people.forEach((p) => {
      void renderBlot(p.avatarSeed || p.id, isPigment(p.pigment) ? p.pigment : 'paynesBlue', size).then((url) => {
        if (live) setUrls((prev) => (prev[p.id] === url ? prev : { ...prev, [p.id]: url }))
      })
    })
    return () => {
      live = false
    }
    // key captures the people that matter for painting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size])

  return urls
}
