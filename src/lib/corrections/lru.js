/** מטמון LRU מוגבל בנפח (בבתים) — מפתחות הם blob sha, כלומר ערכים בלתי משתנים. */
export class ByteLru {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.map = new Map();
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key, value, size) {
    if (size > this.maxBytes) return;
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.size;
      this.map.delete(key);
    }
    this.map.set(key, { value, size });
    this.bytes += size;
    while (this.bytes > this.maxBytes) {
      const [k, e] = this.map.entries().next().value;
      this.map.delete(k);
      this.bytes -= e.size;
    }
  }

  get size() {
    return this.map.size;
  }
}
