// Process-local admission control for CPU/memory-intensive PDF conversions.
// The waiting queue is deliberately bounded: rejecting excess requests prevents
// unbounded promise queues when uploads arrive faster than pages can be rasterized.
function aborted(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('PDF conversion aborted');
  error.name = 'AbortError';
  return error;
}

export function createPdfConversionGate({ maxActive = 2, maxQueued = 4 } = {}) {
  if (![maxActive, maxQueued].every((n) => Number.isSafeInteger(n) && n >= 0) || maxActive < 1) {
    throw new RangeError('invalid PDF conversion concurrency limits');
  }
  let active = 0;
  const waiting = [];

  function makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting.shift();
      if (next) {
        next.signal?.removeEventListener('abort', next.abort);
        // Transfer the active slot directly, retaining the concurrency bound.
        next.resolve(makeRelease());
      } else {
        active--;
      }
    };
  }

  function acquire(signal) {
    if (signal?.aborted) return Promise.reject(aborted(signal));
    if (active < maxActive) {
      active++;
      return Promise.resolve(makeRelease());
    }
    if (waiting.length >= maxQueued) {
      const error = new Error('PDF conversion queue is full');
      error.code = 'PDF_CONVERSION_BUSY';
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const entry = { signal, resolve, reject, abort: null };
      entry.abort = () => {
        const index = waiting.indexOf(entry);
        if (index === -1) return;
        waiting.splice(index, 1);
        signal?.removeEventListener('abort', entry.abort);
        reject(aborted(signal));
      };
      waiting.push(entry);
      signal?.addEventListener('abort', entry.abort, { once: true });
      // Covers a signal aborted between the first check and listener setup.
      if (signal?.aborted) entry.abort();
    });
  }

  return {
    acquire,
    get active() { return active; },
    get queued() { return waiting.length; },
  };
}

// Default to one heavy raster conversion at a time: raw RGBA can temporarily
// increase RSS on very large pages. Operators with sufficient RAM may opt in
// to two active conversions; never permit an unbounded active count.
const maxActive = process.env.PDF_CONVERSION_PARALLELISM === '2' ? 2 : 1;
export const pdfConversionGate = createPdfConversionGate({ maxActive, maxQueued: 4 });
