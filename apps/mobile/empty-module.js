// Stub for @opentelemetry/api — provides no-op implementations for React Native
const noopSpan = {
  setAttribute: () => noopSpan,
  setAttributes: () => noopSpan,
  addEvent: () => noopSpan,
  setStatus: () => noopSpan,
  end: () => {},
  isRecording: () => false,
  recordException: () => {},
  updateName: () => noopSpan,
  spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
}

const noopTracer = {
  startSpan: () => noopSpan,
  startActiveSpan: (_name, fnOrOpts, fnOrCtx, fn) => {
    const cb = fn || fnOrCtx || fnOrOpts
    if (typeof cb === 'function') return cb(noopSpan)
    return noopSpan
  },
}

module.exports = {
  trace: {
    getTracer: () => noopTracer,
    setGlobalTracerProvider: () => {},
  },
  context: {
    active: () => ({}),
    with: (_ctx, fn) => fn(),
  },
  SpanStatusCode: { UNSET: 0, OK: 1, ERROR: 2 },
  SpanKind: { INTERNAL: 0, SERVER: 1, CLIENT: 2, PRODUCER: 3, CONSUMER: 4 },
}
