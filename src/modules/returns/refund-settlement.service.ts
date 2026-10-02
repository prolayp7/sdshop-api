import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { orderRefundedEmail } from '../email/email-templates';
import { buildCreditNotePdf } from './credit-note-pdf';
import { ReturnActor, ReturnsCoreService } from './returns-core.service';

export type RefundOutcome = 'PROCESSED' | 'PROCESSING' | 'FAILED';

/** How a provider's refund status maps onto ours. Anything not clearly final stays PROCESSING. */
export function refundOutcome(providerStatus: string | null | undefined): RefundOutcome {
  const status = (providerStatus ?? '').toLowerCase();
  if (status === 'succeeded' || status === 'completed') return 'PROCESSED';
  if (status === 'failed' || status === 'canceled' || status === 'cancelled' || status === 'denied') return 'FAILED';
  return 'PROCESSING';
}

/** The one place a refund becomes final. Called when the provider answers the refund request directly
 * and again from payment webhooks, so it is idempotent: a refund already in the target state is left alone.
 * A refund only counts as successful once the provider has confirmed it. */
@Injectable()
export class RefundSettlementService {
  private readonly logger = new Logger(RefundSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: ReturnsCoreService,
    private readonly emailService: EmailService,
  ) {}

  async settle(refundId: number, outcome: 'PROCESSED' | 'FAILED', input: { providerRefundId?: string | null; payload?: unknown; failureReason?: string | null; actor: ReturnActor }): Promise<void> {
    const refund = await this.prisma.paymentRefund.findUnique({ where: { id: refundId }, include: { order: { select: { id: true, orderNumber: true, email: true, billingFullName: true, billingCompanyName: true, billingLine1: true, billingLine2: true, billingCity: true, billingCounty: true, billingPostcode: true } }, transaction: { select: { amount: true, currency: true } }, returnRequest: { select: { returnNumber: true } } } });
    if (!refund || refund.status === outcome || refund.status === 'PROCESSED') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: outcome,
          ...(input.providerRefundId ? { providerRefundId: input.providerRefundId } : {}),
          ...(input.payload !== undefined ? { rawPayload: input.payload as Prisma.InputJsonValue } : {}),
          ...(outcome === 'PROCESSED' ? { processedAt: new Date(), failureReason: null } : { failureReason: input.failureReason?.slice(0, 1000) ?? 'The payment provider declined the refund' }),
        },
      });
      if (outcome === 'PROCESSED') await this.applyPaymentStatus(tx, refund.transactionId, refund.orderId);

      if (refund.returnRequestId) {
        if (outcome === 'PROCESSED') {
          // Every refund of this return must be confirmed before the return is complete.
          const open = await tx.paymentRefund.count({ where: { returnRequestId: refund.returnRequestId, status: { in: ['PENDING', 'PROCESSING'] }, id: { not: refundId } } });
          if (!open) {
            await this.core.setStatus(tx, refund.returnRequestId, 'COMPLETED', { action: 'refund.completed', note: `Refund of ${Number(refund.amount).toFixed(2)} confirmed by the payment provider`, actor: input.actor });
            await this.core.settleOrderStatus(tx, refund.orderId, input.actor);
          }
        } else {
          // Back to "refund approved" so an admin can retry.
          await this.core.setStatus(tx, refund.returnRequestId, 'REFUND_APPROVED', { action: 'refund.failed', note: input.failureReason ?? 'The payment provider declined the refund', actor: input.actor });
        }
      }
    });

    if (outcome === 'PROCESSED') {
      const processed = await this.prisma.paymentRefund.aggregate({ where: { transactionId: refund.transactionId, status: 'PROCESSED' }, _sum: { amount: true } });
      const refundType = Number(processed._sum.amount ?? 0) >= Number(refund.transaction.amount) - 0.001 ? 'FULL' : 'PARTIAL';
      const email = orderRefundedEmail({ orderNumber: refund.order.orderNumber, refundAmount: Number(refund.amount).toFixed(2), refundType });
      try {
        const creditNote = await this.renderCreditNote(refund);
        void this.emailService.send(refund.order.email, email.subject, email.html, [{ filename: creditNote.filename, content: creditNote.buffer, contentType: 'application/pdf' }]);
      } catch (error) {
        this.logger.error(`Could not generate credit note for refund ${refundId}`, error instanceof Error ? error.stack : String(error));
        void this.emailService.send(refund.order.email, email.subject, email.html);
      }
    } else {
      this.logger.warn(`Refund ${refundId} failed: ${input.failureReason ?? 'declined'}`);
    }
  }

  private async renderCreditNote(refund: NonNullable<Awaited<ReturnType<PrismaService['paymentRefund']['findUnique']>>> & {
    order: { orderNumber: string; email: string; billingFullName: string; billingCompanyName: string | null; billingLine1: string; billingLine2: string | null; billingCity: string; billingCounty: string | null; billingPostcode: string };
    transaction: { amount: Prisma.Decimal; currency: string };
    returnRequest: { returnNumber: string } | null;
  }) {
    const row = await this.prisma.setting.findUnique({ where: { key: 'general.site' } });
    const site = (row?.value ?? {}) as Record<string, string | undefined>;
    const name = process.env.STORE_NAME || 'SDShop';
    const legalName = process.env.STORE_LEGAL_NAME || `${name} Ltd`;
    const creditNoteNumber = `CN-${String(refund.id).padStart(6, '0')}`;
    const billingAddress = [
      refund.order.billingLine1,
      refund.order.billingLine2,
      [refund.order.billingCity, refund.order.billingCounty, refund.order.billingPostcode].filter(Boolean).join(', '),
    ].filter(Boolean).join(', ');
    const buffer = await buildCreditNotePdf({
      currency: refund.transaction.currency,
      creditNoteNumber,
      orderNumber: refund.order.orderNumber,
      refundNumber: refund.returnRequest?.returnNumber ?? refund.providerRefundId,
      issuedAt: refund.processedAt ?? new Date(),
      customerEmail: refund.order.email,
      amount: Number(refund.amount),
      reason: refund.reason ?? (refund.returnRequest ? `Refund for return ${refund.returnRequest.returnNumber}` : 'Customer refund'),
      company: {
        name,
        legalName,
        address: site.companyAddress ?? '',
        vatNumber: site.vatNumber ?? null,
        email: site.supportEmail ?? '',
        phone: site.supportPhone1 ?? '',
      },
      billing: {
        name: refund.order.billingFullName,
        company: refund.order.billingCompanyName,
        address: billingAddress,
      },
    });
    return { buffer, filename: `credit-note-${creditNoteNumber}.pdf` };
  }

  /** Payment status follows confirmed refunds only. */
  private async applyPaymentStatus(tx: Prisma.TransactionClient | PrismaClient, transactionId: number, orderId: number) {
    const [transaction, refunded] = await Promise.all([
      tx.paymentTransaction.findUniqueOrThrow({ where: { id: transactionId }, select: { amount: true } }),
      tx.paymentRefund.aggregate({ where: { transactionId, status: 'PROCESSED' }, _sum: { amount: true } }),
    ]);
    const total = Number(refunded._sum.amount ?? 0);
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: total >= Number(transaction.amount) - 0.001 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
  }
}
