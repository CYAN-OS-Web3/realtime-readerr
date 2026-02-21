const { Transform } = require('stream')

function createSeed(parts) {
  const s = (parts || []).filter(Boolean).join('|')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  if (!h) h = 1
  return h
}

function createPcmWatermarkTransform(meta) {
  const seed = createSeed([meta && meta.userId, meta && meta.deviceId, meta && meta.transactionId])
  let state = seed
  const step = 97
  return new Transform({
    transform(chunk, enc, cb) {
      const buf = chunk
      const len = buf.length - (buf.length % 2)
      for (let i = 0; i < len; i += 2) {
        state = (state * 1664525 + 1013904223) >>> 0
        if (state % step !== 0) continue
        const bit = state & 1
        let sample = buf.readInt16LE(i)
        const lsb = sample & 1
        if (lsb === bit) continue
        if (sample === 32767 || sample === -32768) {
          sample = sample ^ 1
        } else {
          sample += bit ? 1 : -1
        }
        buf.writeInt16LE(sample, i)
      }
      cb(null, buf)
    }
  })
}

function wrapPcmStreamWithWatermark(stream, meta) {
  if (!stream) return stream
  const t = createPcmWatermarkTransform(meta || {})
  return stream.pipe(t)
}

module.exports = {
  createPcmWatermarkTransform,
  wrapPcmStreamWithWatermark
}

