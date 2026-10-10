// Renders pigment fields off the main thread for wash.js
import { renderField } from './wash-field.js'

self.onmessage = ({ data }) => {
  const pixels = renderField(data.w, data.h, data.opts)
  self.postMessage({ id: data.id, pixels }, [pixels.buffer])
}
