export interface ReconnectPolicyOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
  jitterRatio: number;
  random: () => number;
}

export interface ReconnectSchedule {
  attempt: number;
  delayMs: number;
}

const DEFAULT_JITTER_RATIO = 0.2;
const DEFAULT_MAX_RETRIES = 50;

export class ExponentialReconnectPolicy {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetries: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;
  private attempt = 0;

  constructor(options: Partial<ReconnectPolicyOptions> & Pick<ReconnectPolicyOptions, "baseDelayMs" | "maxDelayMs">) {
    this.baseDelayMs = Math.max(1, options.baseDelayMs);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs);
    this.maxRetries = Math.max(1, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.jitterRatio = Math.min(1, Math.max(0, options.jitterRatio ?? DEFAULT_JITTER_RATIO));
    this.random = options.random ?? Math.random;
  }

  public reset(): void {
    this.attempt = 0;
  }

  public getAttempt(): number {
    return this.attempt;
  }

  public canRetry(): boolean {
    return this.attempt < this.maxRetries;
  }

  public next(): ReconnectSchedule | null {
    if (!this.canRetry()) {
      return null;
    }

    const exponent = 2 ** this.attempt;
    const unclamped = this.baseDelayMs * exponent;
    const clamped = Math.min(this.maxDelayMs, unclamped);
    const jitterWindow = clamped * this.jitterRatio;
    const jitterOffset = (this.random() * 2 - 1) * jitterWindow;
    const delayMs = Math.max(0, Math.round(clamped + jitterOffset));

    this.attempt += 1;
    return { attempt: this.attempt, delayMs };
  }
}
