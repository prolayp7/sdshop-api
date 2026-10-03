import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { relative, resolve, sep } from 'path';
import { randomBytes } from 'crypto';
import { Prisma, ProductVariant } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CartService } from '../cart/cart.service';
import { StorefrontShippingService } from '../shipping/storefront-shipping.service';
import { StorefrontCouponsService } from '../coupons/coupons.service';
import { CheckoutDto } from './dto/checkout.dto';
import { mediaBuckets, mediaUploadDirectory } from '../../../bootstrap';
import { buildInvoicePdf } from './invoice-pdf';
import { EmailService } from '../../email/email.service';
import { CatalogAlertsService } from '../../email/catalog-alerts.service';
import { orderConfirmationEmail, orderCancelledEmail, paymentFailedEmail, operationsAlertEmail } from '../../email/email-templates';
import { RevalidationService } from '../../revalidation/revalidation.service';
import { productTarget } from '../../revalidation/targets';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');
const CANCELLABLE_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'PROCESSING'];

const orderDetailInclude = {
  invoice: true,
  items: { include: { returnItems: { select: { quantity: true, approvedQuantity: true, receivedQuantity: true, acceptedQuantity: true, inspectionResult: true, returnRequest: { select: { returnNumber: true, status: true } } } } } },
  shippingMethod: { select: { id: true, title: true, carrier: true } },
  shipments: { include: { events: { orderBy: { occurredAt: 'desc' as const } } } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly shippingService: StorefrontShippingService,
    private readonly couponsService: StorefrontCouponsService,
    private readonly emailService: EmailService,
    private readonly revalidation: RevalidationService,
    private readonly catalogAlerts: CatalogAlertsService,
  ) {}

  private revalidateStock(productIds: number[], context: string) {
    void productTarget(this.prisma, productIds)
      .then((target) => this.revalidation.revalidate(target, context))
      .catch((error) => this.logger.warn(`Stock cache invalidation failed after ${context}: ${(error as Error).message}`));
  }

  private async generateOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `UK${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new Error('Could not generate a unique order number');
  }

  private async findByUuid(uuid: string) {
    const order = await this.prisma.order.findFirst({ where: { uuid }, include: orderDetailInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async checkout(customerId: number | undefined, guestToken: string | undefined, dto: CheckoutDto, idempotencyKey?: string) {
    // a retried/double-submitted checkout with the same key returns the order it already created
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({ where: { checkoutKey: idempotencyKey }, select: { uuid: true, userId: true } });
      if (existing) {
        if (existing.userId !== (customerId ?? null)) throw new ConflictException('Idempotency-Key was already used');
        return this.findByUuid(existing.uuid);
      }
    }
    const cart = await this.cartService.cartForCheckout(customerId, guestToken);
    const activeItems = cart?.items.filter((i) => !i.savedForLater) ?? [];
    if (!activeItems.length) throw new BadRequestException('Cart is empty');

    let email = dto.email;
    if (customerId) {
      const customer = await this.prisma.user.findUnique({ where: { id: customerId }, select: { email: true } });
      email = email ?? customer!.email;
    }
    if (!email) throw new BadRequestException('Email is required for guest checkout');

    const lines = activeItems.map((item) => {
      const variant = item.productVariant;
      if (item.quantity > variant.stockQty) {
        throw new BadRequestException(`"${variant.product.title}" only has ${variant.stockQty} in stock`);
      }
      const unitPrice = Number(variant.salePrice ?? variant.price);
      const vatRatePercent = Number(variant.product.taxRate?.ratePercent ?? 0);
      const subtotal = round2(unitPrice * item.quantity);
      // Catalogue prices are VAT-inclusive (matches every storefront price
      // display), so vatAmount extracts the VAT already inside subtotal
      // rather than adding it on top - see the total calculation below.
      const vatAmount = round2(subtotal - subtotal / (1 + vatRatePercent / 100));
      return {
        productId: variant.product.id,
        productVariantId: variant.id,
        titleSnapshot: variant.product.title,
        variantTitleSnapshot: variant.title,
        skuSnapshot: variant.barcode,
        quantity: item.quantity,
        unitPrice,
        vatRatePercent,
        vatAmount,
        subtotal,
        onSale: variant.salePrice !== null,
        weightKg: Number(variant.weightKg ?? 0) * item.quantity,
      };
    });

    const subtotal = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
    const vatTotal = round2(lines.reduce((sum, l) => sum + l.vatAmount, 0));
    const totalWeightKg = round2(lines.reduce((sum, l) => sum + l.weightKg, 0));

    const shippingQuote = await this.shippingService.rateFor(dto.shippingMethodId, totalWeightKg, subtotal);
    let shippingCharge = shippingQuote.rate;

    let discountTotal = 0;
    let couponLineAmount = 0;
    let couponResult: Awaited<ReturnType<StorefrontCouponsService['validate']>> | null = null;
    if (dto.couponCode) {
      couponResult = await this.couponsService.validate(
        dto.couponCode,
        lines.map((l) => ({ lineSubtotal: l.subtotal, onSale: l.onSale })),
        customerId,
      );
      if (couponResult.freeShipping) {
        couponLineAmount = shippingCharge;
        shippingCharge = 0;
      } else {
        discountTotal = couponResult.discountAmount;
        couponLineAmount = couponResult.discountAmount;
      }
    }

    // subtotal is already VAT-inclusive - vatTotal is the informational
    // VAT component within it, not an additional charge.
    const total = round2(subtotal - discountTotal + shippingCharge);
    const shipping = dto.shippingAddress;
    const billing = dto.billingAddress ?? dto.shippingAddress;
    const orderNumber = await this.generateOrderNumber();

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          checkoutKey: idempotencyKey,
          userId: customerId,
          email,
          phone: dto.phone,
          status: 'AWAITING_PAYMENT',
          paymentStatus: 'PENDING',
          billingFullName: billing.fullName,
          billingCompanyName: billing.companyName,
          billingLine1: billing.line1,
          billingLine2: billing.line2,
          billingCity: billing.city,
          billingCounty: billing.county,
          billingPostcode: billing.postcode,
          billingCountry: billing.country ?? 'GB',
          billingPhone: billing.phone,
          shippingFullName: shipping.fullName,
          shippingCompanyName: shipping.companyName,
          shippingLine1: shipping.line1,
          shippingLine2: shipping.line2,
          shippingCity: shipping.city,
          shippingCounty: shipping.county,
          shippingPostcode: shipping.postcode,
          shippingCountry: shipping.country ?? 'GB',
          shippingPhone: shipping.phone,
          shippingMethodId: dto.shippingMethodId,
          subtotal,
          discountTotal,
          shippingCharge,
          vatTotal,
          total,
          couponCode: couponResult?.coupon.code,
          customerNote: dto.customerNote,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              productVariantId: l.productVariantId,
              titleSnapshot: l.titleSnapshot,
              variantTitleSnapshot: l.variantTitleSnapshot,
              skuSnapshot: l.skuSnapshot,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              vatRatePercent: l.vatRatePercent,
              vatAmount: l.vatAmount,
              subtotal: l.subtotal,
            })),
          },
          statusHistory: { create: { toStatus: 'AWAITING_PAYMENT' } },
          ...(couponResult
            ? {
                couponLine: {
                  create: { couponId: couponResult.coupon.id, couponCode: couponResult.coupon.code, discountAmount: couponLineAmount },
                },
              }
            : {}),
        },
      });

      for (const item of activeItems) {
        // conditional decrement: a concurrent checkout that took the last units makes this fail instead of overselling
        const { count } = await tx.productVariant.updateMany({
          where: { id: item.productVariantId, stockQty: { gte: item.quantity } },
          data: { stockQty: { decrement: item.quantity } },
        });
        if (count === 0) throw new BadRequestException(`"${item.productVariant.product.title}" just sold out`);
      }
      if (couponResult) {
        await tx.coupon.update({ where: { id: couponResult.coupon.id }, data: { usageCount: { increment: 1 } } });
      }
      if (cart) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id, savedForLater: false } });
      }

      return order;
    }).catch(async (error) => {
      // lost a race with a concurrent request carrying the same key - return the winner's order
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.order.findUnique({ where: { checkoutKey: idempotencyKey }, select: { uuid: true, userId: true } });
        if (winner && winner.userId === (customerId ?? null)) return null;
      }
      throw error;
    });
    if (!created) return this.findByUuid((await this.prisma.order.findUniqueOrThrow({ where: { checkoutKey: idempotencyKey } })).uuid);

    for (const item of activeItems) void this.catalogAlerts.checkLowStock(item.productVariantId);
    this.revalidateStock(lines.map((line) => line.productId), 'OrdersService.checkout');
    return this.findByUuid(created.uuid);
  }

  async sendPaidOrderConfirmation(orderId: number): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
      if (!order || order.paymentStatus !== 'PAID' || !order.invoice) return;

      const customer = order.userId
        ? await this.prisma.user.findUnique({ where: { id: order.userId }, select: { firstName: true } })
        : null;
      const firstName = customer?.firstName || order.shippingFullName.trim().split(/\s+/)[0] || 'there';
      const confirmation = orderConfirmationEmail({
        orderNumber: order.orderNumber,
        orderUuid: order.uuid,
        customerFirstName: firstName,
        placedAt: order.placedAt,
        items: order.items.map((item) => ({ name: item.titleSnapshot, meta: `${item.variantTitleSnapshot} · Qty ${item.quantity}`, price: Number(item.subtotal) })),
        subtotal: Number(order.subtotal),
        shipping: Number(order.shippingCharge),
        vat: Number(order.vatTotal),
        total: Number(order.total),
        address: { fullName: order.shippingFullName, line1: order.shippingLine1, line2: order.shippingLine2, city: order.shippingCity, postcode: order.shippingPostcode },
      });
      const invoice = await this.renderInvoice(order);
      await this.emailService.send(order.email, confirmation.subject, confirmation.html, [{ filename: invoice.filename, content: invoice.buffer, contentType: 'application/pdf' }]);
      if (process.env.OPERATIONS_EMAIL) {
        const alert = operationsAlertEmail({ title: `New paid order ${order.orderNumber}`, message: `Customer: ${order.email}\nTotal: ${Number(order.total).toFixed(2)} ${order.invoice.currency}\nPlaced: ${order.placedAt.toISOString()}` });
        void this.emailService.send(process.env.OPERATIONS_EMAIL, alert.subject, alert.html);
      }
    } catch (error) {
      this.logger.warn(`Paid order confirmation could not be prepared for order ${orderId}: ${(error as Error).message}`);
    }
  }

  async sendPaymentFailureNotification(orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, email: true } });
    if (!order) return;
    const email = paymentFailedEmail({ orderNumber: order.orderNumber });
    void this.emailService.send(order.email, email.subject, email.html);
  }

  async list(customerId: number, query: PaginationQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where = { userId: customerId };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { placedAt: 'desc' },
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders, meta: buildPaginationMeta(page, perPage, total) };
  }

  /** Renders the invoice PDF on demand - only for orders that have been paid. */
  async invoicePdf(customerId: number, uuid: string): Promise<{ buffer: Buffer; filename: string }> {
    return this.renderInvoice(await this.detail(customerId, uuid));
  }

  /** Guest-friendly invoice download: the order number + checkout email act as the credential. */
  async guestInvoicePdf(orderNumber: string, email: string): Promise<{ buffer: Buffer; filename: string }> {
    return this.renderInvoice(await this.findByNumberAndEmail(orderNumber, email));
  }

  private async findByNumberAndEmail(orderNumber: string, email: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber: { equals: orderNumber.trim(), mode: 'insensitive' }, email: { equals: email.trim(), mode: 'insensitive' } },
      include: orderDetailInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Public order tracking for guests (and anyone holding the order number + email). */
  async track(orderNumber: string, email: string) {
    const order = await this.findByNumberAndEmail(orderNumber, email);
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      placedAt: order.placedAt,
      hasInvoice: !!order.invoice,
      shippingMethod: order.shippingMethod?.title ?? null,
      statusHistory: order.statusHistory.map((h) => ({ status: h.toStatus, createdAt: h.createdAt })),
      shipments: order.shipments.map((sh) => ({
        carrier: sh.carrier,
        status: sh.status,
        trackingNumber: sh.trackingNumber,
        trackingUrl: sh.trackingUrl,
        estimatedDeliveryAt: sh.estimatedDeliveryAt,
        deliveredAt: sh.deliveredAt,
        events: sh.events.map((e) => ({ status: e.status, description: e.description, location: e.location, occurredAt: e.occurredAt })),
      })),
    };
  }

  private async renderInvoice(order: Awaited<ReturnType<OrdersService['findByUuid']>>): Promise<{ buffer: Buffer; filename: string }> {
    if (!order.invoice) throw new ConflictException('An invoice is available once the order has been paid');

    const row = await this.prisma.setting.findUnique({ where: { key: 'general.site' } });
    const s = (row?.value ?? {}) as Record<string, string | undefined>;
    let logo: Buffer | null = null;
    if (s.logo) {
      // Uploaded logos are usually WebP, which PDFs can't embed - convert to PNG.
      const storedPath = s.logo.startsWith('/uploads/') ? s.logo.slice('/uploads/'.length) : s.logo;
      const candidates = storedPath.includes('/') ? [storedPath] : [`${mediaBuckets.logos}/${storedPath}`, storedPath];
      for (const candidate of candidates) {
        const filePath = resolve(mediaUploadDirectory, candidate);
        const relativePath = relative(mediaUploadDirectory, filePath);
        if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) continue;
        try { logo = await sharp(filePath).png().toBuffer(); break; } catch { /* missing/unreadable - try the next supported location */ }
      }
    }
    const num = (v: unknown) => Number(v ?? 0);
    const lines = order.items.map((item) => {
      const gross = num(item.subtotal), vat = num(item.vatAmount);
      return { title: item.titleSnapshot, variant: item.variantTitleSnapshot, sku: item.skuSnapshot, qty: item.quantity, unit: num(item.unitPrice), discount: num(item.discount), rate: num(item.vatRatePercent), vat, gross, net: gross - vat, netUnit: (gross - vat) / item.quantity };
    });
    const shipment = order.shipments[0];
    const name = process.env.STORE_NAME || 'RigForge';
    const buffer = await buildInvoicePdf({
      currency: order.invoice.currency, invoiceNumber: order.invoice.invoiceNumber, orderNumber: order.orderNumber, placedAt: order.placedAt, issuedAt: order.invoice.issuedAt, email: order.email, status: order.status, paymentStatus: order.paymentStatus,
      billing: { name: order.billingFullName, company: order.billingCompanyName, address: [order.billingLine1, order.billingLine2, [order.billingCity, order.billingPostcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
      shipping: { name: order.shippingFullName, address: [order.shippingLine1, order.shippingLine2, [order.shippingCity, order.shippingPostcode].filter(Boolean).join(' ')].filter(Boolean).join(', '), carrier: shipment ? `Carrier: ${shipment.carrier}${shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}` : null },
      shippingMethod: order.shippingMethod?.title ?? null,
      lines,
      subtotal: num(order.subtotal), discount: num(order.discountTotal), couponCode: order.couponCode, delivery: num(order.shippingCharge), vatTotal: num(order.vatTotal), total: num(order.total),
      company: { name, legalName: process.env.STORE_LEGAL_NAME || `${name} Ltd`, address: s.companyAddress ?? '', vatNumber: s.vatNumber ?? '', email: s.supportEmail ?? '', phone: s.supportPhone1 ?? '', copyright: s.copyright || `© ${new Date().getFullYear()} ${process.env.STORE_LEGAL_NAME || `${name} Ltd`}` },
      logo,
    });
    return { buffer, filename: `invoice-${order.invoice.invoiceNumber}.pdf` };
  }

  async detail(customerId: number, uuid: string) {
    const order = await this.findByUuid(uuid);
    if (order.userId !== customerId) throw new NotFoundException('Order not found');
    return order;
  }

  async cancel(customerId: number, uuid: string, reason?: string) {
    const order = await this.findByUuid(uuid);
    if (order.userId !== customerId) throw new NotFoundException('Order not found');
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Order cannot be cancelled once it is ${order.status.toLowerCase().replace(/_/g, ' ')}`);
    }
    const { updated, changes } = await this.prisma.$transaction(async (tx) => {
      const changes: Array<{ before: ProductVariant; after: ProductVariant }> = [];
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: 'CANCELLED', note: reason },
      });
      for (const item of order.items) {
        const before = await tx.productVariant.findUniqueOrThrow({ where: { id: item.productVariantId } });
        const after = await tx.productVariant.update({ where: { id: item.productVariantId }, data: { stockQty: { increment: item.quantity } } });
        changes.push({ before, after });
      }
      return { updated: await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderDetailInclude }), changes };
    });

    for (const { before, after } of changes) void this.catalogAlerts.variantChanged(before, after);
    const email = orderCancelledEmail({ orderNumber: updated.orderNumber });
    void this.emailService.send(updated.email, email.subject, email.html);
    this.revalidateStock(order.items.map((item) => item.productId), 'OrdersService.cancel');

    return updated;
  }
}
