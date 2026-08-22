export type CircuitBreakerOptions = {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
};

/** Interrompe le chiamate a un provider dopo errori consecutivi, poi riprova. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  canRequest(): boolean {
    if (this.openedAt === null) return true;
    if (this.now() - this.openedAt >= this.options.cooldownMs) {
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.openedAt = this.now();
    }
  }
}
