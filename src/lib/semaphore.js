// סמפור אסינכרוני קטן בתוך תהליך אחד (FIFO). run() משחרר תמיד, גם כשהפונקציה זורקת;
// timeoutMs מגביל רק את ההמתנה בתור (לא את ההרצה עצמה) ומשליך SemaphoreTimeoutError.

export class SemaphoreTimeoutError extends Error {
  constructor() {
    super('semaphore wait timed out');
    this.name = 'SemaphoreTimeoutError';
    this.code = 'semaphore_timeout';
  }
}

export function createSemaphore(max = 1) {
  if (!Number.isInteger(max) || max < 1) throw new Error('invalid_semaphore_size');
  let active = 0;
  const queue = [];

  const acquire = (timeoutMs) =>
    new Promise((resolve, reject) => {
      if (active < max && queue.length === 0) {
        active++;
        resolve();
        return;
      }
      const waiter = { resolve, timer: null };
      if (Number.isFinite(timeoutMs)) {
        waiter.timer = setTimeout(() => {
          const i = queue.indexOf(waiter);
          if (i >= 0) queue.splice(i, 1);
          reject(new SemaphoreTimeoutError());
        }, Math.max(0, timeoutMs));
      }
      queue.push(waiter);
    });

  const release = () => {
    const next = queue.shift();
    if (next) {
      // ה-slot עובר ישירות לממתין הבא (active לא יורד)
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    } else {
      active--;
    }
  };

  return {
    /** @param {() => Promise<any>|any} fn  @param {{timeoutMs?:number}} [opts] */
    async run(fn, { timeoutMs } = {}) {
      await acquire(timeoutMs);
      try {
        return await fn();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}
