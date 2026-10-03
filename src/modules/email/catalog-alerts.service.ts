import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ProductVariant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { lowStockAlertEmail, wishlistPriceDropEmail, wishlistRestockEmail } from './email-templates';
import { EmailService } from './email.service';

type VariantSnapshot = Pick<ProductVariant, 'id' | 'stockQty' | 'lowStockThreshold' | 'price' | 'salePrice'>;

@Injectable()
export class CatalogAlertsService {
  private readonly logger = new Logger(CatalogAlertsService.name);

  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  async variantChanged(before: VariantSnapshot, after: VariantSnapshot): Promise<void> {
    await this.checkLowStock(after.id);

    const cameBackInStock = before.stockQty === 0 && after.stockQty > 0;
    const previousPrice = Number(before.salePrice ?? before.price);
    const currentPrice = Number(after.salePrice ?? after.price);
    const priceDropped = currentPrice < previousPrice;
    if (!cameBackInStock && !priceDropped) return;

    try {
      const items = await this.prisma.wishlistItem.findMany({
        where: {
          productVariantId: after.id,
          productVariant: {
            status: 'ACTIVE',
            deletedAt: null,
            product: { status: 'ACTIVE', deletedAt: null },
          },
        },
        select: {
          productVariant: {
            select: {
              title: true,
              product: { select: { title: true, slug: true } },
            },
          },
          wishlist: { select: { user: { select: { email: true, status: true } } } },
        },
      });
      if (!items.length) return;

      const emails = [...new Set(items
        .filter((item) => item.wishlist.user.status === 'ACTIVE')
        .map((item) => item.wishlist.user.email))];
      if (!emails.length) return;

      const subscribers = await this.prisma.newsletterSubscriber.findMany({
        where: { email: { in: emails, mode: 'insensitive' }, unsubscribedAt: null },
        select: { email: true, unsubscribeToken: true },
      });
      const subscriberByEmail = new Map(subscribers.map((subscriber) => [subscriber.email.toLowerCase(), subscriber]));
      const product = items[0].productVariant.product;
      const variantTitle = items[0].productVariant.title;
      const productUrl = `${process.env.STOREFRONT_URL ?? 'http://localhost:3002'}/product/${encodeURIComponent(product.slug)}`;
      const deliveries = items.flatMap((item) => {
        const subscriber = subscriberByEmail.get(item.wishlist.user.email.toLowerCase());
        if (!subscriber) return [];
        const template = cameBackInStock
          ? wishlistRestockEmail({ productTitle: product.title, variantTitle, productUrl, unsubscribeToken: subscriber.unsubscribeToken })
          : wishlistPriceDropEmail({ productTitle: product.title, variantTitle, price: currentPrice, productUrl, unsubscribeToken: subscriber.unsubscribeToken });
        return [{ email: subscriber.email, template }];
      });
      const uniqueDeliveries = [...new Map(deliveries.map((delivery) => [delivery.email.toLowerCase(), delivery])).values()];

      for (let index = 0; index < uniqueDeliveries.length; index += 20) {
        await Promise.all(uniqueDeliveries.slice(index, index + 20).map(({ email, template }) =>
          this.email.send(email, template.subject, template.html)));
      }
    } catch (error) {
      this.logger.warn(`Wishlist alert could not be sent for variant ${after.id}: ${(error as Error).message}`);
    }
  }

  async checkLowStock(variantId: number): Promise<void> {
    try {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          title: true,
          stockQty: true,
          lowStockThreshold: true,
          lowStockAlertSentAt: true,
          status: true,
          product: { select: { title: true, status: true, receiveLowStockAlert: true } },
        },
      });
      if (!variant) return;

      if (variant.stockQty > variant.lowStockThreshold) {
        if (variant.lowStockAlertSentAt) {
          await this.prisma.productVariant.updateMany({
            where: { id: variant.id, lowStockAlertSentAt: variant.lowStockAlertSentAt, stockQty: { gt: variant.lowStockThreshold } },
            data: { lowStockAlertSentAt: null },
          });
        }
        return;
      }

      const recipient = process.env.OPERATIONS_EMAIL;
      if (!recipient || variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE' || !variant.product.receiveLowStockAlert) return;

      const sentAt = new Date();
      const claim = await this.prisma.productVariant.updateMany({
        where: { id: variant.id, lowStockAlertSentAt: null, stockQty: { lte: variant.lowStockThreshold } },
        data: { lowStockAlertSentAt: sentAt },
      });
      if (!claim.count) return;

      const alert = lowStockAlertEmail({
        productTitle: variant.product.title,
        variantTitle: variant.title,
        stockQty: variant.stockQty,
        threshold: variant.lowStockThreshold,
      });
      if (!await this.email.send(recipient, alert.subject, alert.html)) {
        await this.prisma.productVariant.updateMany({ where: { id: variant.id, lowStockAlertSentAt: sentAt }, data: { lowStockAlertSentAt: null } });
      }
    } catch (error) {
      this.logger.warn(`Low-stock alert could not be sent for variant ${variantId}: ${(error as Error).message}`);
    }
  }
}