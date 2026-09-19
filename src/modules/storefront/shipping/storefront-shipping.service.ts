import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ShippingMethod, ShippingRateBand } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ShippingQuote {
  id: number;
  title: string;
  carrier: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  // Earliest/latest delivery date (YYYY-MM-DD), counting Mon-Fri working days from today.
  // ponytail: ignores bank holidays and the dispatch cut-off time.
  estimatedDeliveryFrom: string | null;
  estimatedDeliveryTo: string | null;
  rate: number;
}

function addWorkingDays(from: Date, days: number): string {
  const date = new Date(from);
  for (let added = 0; added < days; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class StorefrontShippingService {
  constructor(private readonly prisma: PrismaService) {}

  // ponytail: ProductShippingMethod (per-product carrier restrictions) isn't
  // consulted — every ACTIVE method is quoted regardless of cart contents.
  private quoteFor(
    method: ShippingMethod & { rateBands: ShippingRateBand[] },
    totalWeightKg: number,
    subtotal: number,
  ): ShippingQuote | null {
    let rate: number | null = null;
    if (method.rateType === 'WEIGHT_BANDED') {
      const band = method.rateBands.find(
        (b) => totalWeightKg >= Number(b.minWeightKg) && totalWeightKg <= Number(b.maxWeightKg),
      );
      rate = band ? Number(band.rate) : null;
    } else {
      rate = method.flatRate !== null ? Number(method.flatRate) : null;
    }
    if (rate === null) return null;

    if (method.freeOverAmount !== null && subtotal >= Number(method.freeOverAmount)) {
      rate = 0;
    }

    return {
      id: method.id,
      title: method.title,
      carrier: method.carrier,
      estimatedDaysMin: method.estimatedDaysMin,
      estimatedDaysMax: method.estimatedDaysMax,
      estimatedDeliveryFrom: method.estimatedDaysMin !== null ? addWorkingDays(new Date(), method.estimatedDaysMin) : null,
      estimatedDeliveryTo: method.estimatedDaysMax !== null ? addWorkingDays(new Date(), method.estimatedDaysMax) : null,
      rate,
    };
  }

  async quotes(totalWeightKg: number, subtotal: number): Promise<ShippingQuote[]> {
    const methods = await this.prisma.shippingMethod.findMany({
      where: { status: 'ACTIVE' },
      include: { rateBands: true },
    });
    return methods
      .map((method) => this.quoteFor(method, totalWeightKg, subtotal))
      .filter((q): q is ShippingQuote => q !== null);
  }

  async rateFor(shippingMethodId: number, totalWeightKg: number, subtotal: number): Promise<ShippingQuote> {
    const method = await this.prisma.shippingMethod.findFirst({
      where: { id: shippingMethodId, status: 'ACTIVE' },
      include: { rateBands: true },
    });
    if (!method) throw new NotFoundException('Shipping method not found');
    const quote = this.quoteFor(method, totalWeightKg, subtotal);
    if (!quote) throw new BadRequestException('This shipping method has no rate configured for the order weight');
    return quote;
  }
}
