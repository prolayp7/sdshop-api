import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { withLease } from '../../../common/lease';
import { PrismaService } from '../../../prisma/prisma.service';
import { RevalidationService } from '../../revalidation/revalidation.service';
import { productTarget } from '../../revalidation/targets';

const SWEEP_MS = 5 * 60 * 1000;
const holdMinutes = () => Number(process.env.UNPAID_ORDER_HOLD_MINUTES ?? 60);

/** Releases stock held by orders that were never paid. Orders are created before
 * payment (stock is decremented then), so abandoned checkouts must expire. */
@Injectable()
export class OrderExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly revalidation: RevalidationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e)), SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Cancels stale unpaid orders and restocks them; returns how many. */
  async sweep(): Promise<number> {
    return (await withLease(this.prisma, 727301, () => this.expireStale())) ?? 0;
  }

  private async expireStale(): Promise<number> {
    const cutoff = new Date(Date.now() - holdMinutes() * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', placedAt: { lt: cutoff } },
      include: { items: true },
    });
    let expired = 0;
    for (const order of stale) {
      const released = await this.prisma.$transaction(async (tx) => {
        // guard on status so a payment landing mid-sweep (or another instance) wins
        const { count } = await tx.order.updateMany({ where: { id: order.id, status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' }, data: { status: 'CANCELLED' } });
        if (!count) return false;
        await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: 'AWAITING_PAYMENT', toStatus: 'CANCELLED', note: 'Payment not received in time - stock released' } });
        for (const item of order.items) {
          await tx.productVariant.update({ where: { id: item.productVariantId }, data: { stockQty: { increment: item.quantity } } });
        }
        return true;
      });
      if (released) {
        expired += 1;
        void productTarget(this.prisma, order.items.map((item) => item.productId))
          .then((target) => this.revalidation.revalidate(target, `OrderExpiryService.expire order=${order.id}`))
          .catch((error) => this.logger.warn(`Stock cache invalidation failed for expired order ${order.id}: ${(error as Error).message}`));
      }
    }
    if (expired) this.logger.log(`Expired ${expired} unpaid order(s)`);
    return expired;
  }
}
