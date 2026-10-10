// Renders pigment fields off the main thread for paint.ts
import { renderField, type FieldOptions } from './field'

interface Job {
  id: number
  w: number
  h: number
  opts: FieldOptions
}

self.onmessage = ({ data }: MessageEvent<Job>) => {
  const pixels = renderField(data.w, data.h, data.opts)
  ;(self as unknown as Worker).postMessage({ id: data.id, pixels }, [pixels.buffer])
}
