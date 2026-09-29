import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentAttemptsService } from './payment-attempts.service';

describe('PaymentAttemptsService', () => {
  const dto = { orderUuid: '846fcbd1-e7fc-4d6f-bde2-cadbc24355d5', email: 'buyer@example.com', provider: 'TWOCHECKOUT' as const };

  it('rejects an unconfigured provider before creating an attempt', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue(null) } };
    // create() only reaches PaymentStateService/PaypalGatewayService for a
    // PAYPAL attempt (ensureProviderOrder short-circuits otherwise) - this
    // suite only exercises a gateway-less provider, so undefined stand-ins are never touched.
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({ where: { key: 'integration.payment.2checkout' }, select: { value: true } });
  });

  it('rejects a configured but disabled provider', async () => {
    const prisma = { setting: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: false } }) } };
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);

    await expect(service.create(dto, 'checkout-session-0001')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the server-side order total and records initial history', async () => {
    const total = new Prisma.Decimal('149.95');
    const attempt = {
      id: 91,
      uuid: 'a339dc4e-a2ec-4313-832f-97185679860b',
      order_id: 12,
      provider: 'TWOCHECKOUT' as const,
      status: 'CREATED',
      amount: total,
      currency: 'GBP',
      redirect_url: null,
      failure_code: null,
      failure_message: null,
      retryable: false,
      expires_at: null,
    };
    const rootQuery = jest.fn()
      .mockResolvedValueOnce([{ id: 12, uuid: dto.orderUuid, total, payment_status: 'PENDING', status: 'AWAITING_PAYMENT' }])
      .mockResolvedValueOnce([]);
    const tx = { $queryRaw: jest.fn().mockResolvedValue([attempt]), $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = {
      setting: { findUnique: jest.fn().mockResolvedValue({ value: { enabled: true } }) },
      $queryRaw: rootQuery,
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    // create() only reaches PaymentStateService/PaypalGatewayService for a
    // PAYPAL attempt (ensureProviderOrder short-circuits otherwise) - this
    // suite only exercises a gateway-less provider, so undefined stand-ins are never touched.
    const service = new PaymentAttemptsService(prisma as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);

    const result = await service.create(dto, 'checkout-session-0001');

    expect(result).toMatchObject({ attemptId: attempt.uuid, amount: total, currency: 'GBP', status: 'CREATED' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('creates the invoice and sends the paid-order confirmation after capture', async () => {
    const total = new Prisma.Decimal('149.95');
    const attempt = { id: 91, uuid: 'attempt-uuid', orderId: 12, provider: 'STRIPE', amount: total, currency: 'GBP' };
    const order = { id: 12, status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING', total };
    const tx = {
      paymentAttempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue(undefined) },
      paymentTransaction: { create: jest.fn().mockResolvedValue(undefined) },
      invoice: { create: jest.fn().mockResolvedValue(undefined) },
      orderStatusHistory: { create: jest.fn().mockResolvedValue(undefined) },
      $queryRaw: jest.fn().mockResolvedValue([{ n: 42n }]),
    };
    const prisma = {
      paymentAttempt: { findUnique: jest.fn().mockResolvedValue({ status: 'PROCESSING', provider: 'STRIPE', amount: total, currency: 'GBP' }) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    };
    const paymentState = { transition: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const orders = { sendPaidOrderConfirmation: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentAttemptsService(prisma as never, paymentState as never, undefined as never, undefined as never, audit as never, orders as never);

    await service.finalizeCapture(91, { captured: true, providerTransactionId: 'pi_test_1' });

    expect(tx.invoice.create).toHaveBeenCalledWith({ data: { invoiceNumber: 'INV-000042', orderId: 12, currency: 'GBP', total } });
    expect(orders.sendPaidOrderConfirmation).toHaveBeenCalledWith(12);
  });
});
