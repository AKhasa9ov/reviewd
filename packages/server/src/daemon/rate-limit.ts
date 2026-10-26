export interface RateLimitConfig {
  mutations: number;
  reads: number;
  windowMs: number;
}

interface Window {
  start: number;
  count: number;
}

/** Fixed-window per-peer limiter; enough for a single daemon and cheap to test. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly config: RateLimitConfig;
  private readonly now: () => number;

  constructor(config: RateLimitConfig, now: () => number = Date.now) {
    this.config = config;
    this.now = now;
  }

  check(
    peer: string,
    kind: 'mutation' | 'read',
  ): { allowed: true } | { allowed: false; retryAfter: number } {
    const limit = kind === 'mutation' ? this.config.mutations : this.config.reads;
    const time = this.now();
    const key = `${kind}:${peer}`;
    const existing = this.windows.get(key);
    if (existing === undefined || time - existing.start >= this.config.windowMs) {
      this.windows.set(key, { start: time, count: 1 });
      return { allowed: true };
    }
    if (existing.count >= limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((existing.start + this.config.windowMs - time) / 1000),
      );
      return { allowed: false, retryAfter };
    }
    existing.count += 1;
    return { allowed: true };
  }

  cleanup(): void {
    const time = this.now();
    for (const [key, window] of this.windows) {
      if (time - window.start >= this.config.windowMs) this.windows.delete(key);
    }
  }
}
