import { Injectable, Logger } from '@nestjs/common';

export type RevalidationTarget = { tags?: string[]; paths?: string[] };

export const RETRY_DELAYS_MS = [2_000, 10_000];
const REQUEST_TIMEOUT_MS = 5_000;

@Injectable()
export class RevalidationService {
  private readonly logger = new Logger('Revalidation');

  async revalidate(target: RevalidationTarget, context: string): Promise<boolean> {
    const tags = [...new Set(target.tags ?? [])];
    const paths = [...new Set(target.paths ?? [])];
    if (!tags.length && !paths.length) return true;
    const secret = process.env.REVALIDATION_SECRET;
    if (!secret) {
      this.logger.warn(`[REVALIDATION] context=${context} status=skipped reason=REVALIDATION_SECRET not set`);
      return false;
    }
    const storefront = (process.env.STOREFRONT_URL || 'http://localhost:3002').replace(/\/$/, '');
    const url = process.env.REVALIDATION_URL || `${storefront}/api/revalidate`;
    const summary = `context=${context} tags=${tags.join(',') || '-'} paths=${paths.join(',') || '-'}`;

    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags, paths }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) {
          this.logger.log(`[REVALIDATION] ${summary} status=success attempt=${attempt}`);
          return true;
        }
        if (response.status < 500) {
          this.logger.error(`[REVALIDATION] ${summary} status=failed attempt=${attempt} error=HTTP ${response.status} (not retried)`);
          return false;
        }
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const delay = RETRY_DELAYS_MS[attempt - 1];
        if (delay === undefined) {
          this.logger.error(`[REVALIDATION] ${summary} status=failed attempt=${attempt} error=${message} (giving up)`);
          return false;
        }
        this.logger.warn(`[REVALIDATION] ${summary} status=retrying attempt=${attempt} error=${message}`);
        await new Promise((resolve) => setTimeout(resolve, delay).unref());
      }
    }
  }
}