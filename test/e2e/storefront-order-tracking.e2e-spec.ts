import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Storefront order tracking, guest invoice & delivery estimates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderNumber: string;
  let orderId: number;
  const email = `track-${Date.now()}@example.com`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });
    const method = await prisma.shippingMethod.findFirstOrThrow({ where: { status: 'ACTIVE', rateType: 'FLAT' } });

    const added = await request(app.getHttpServer()).post('/api/v1/cart/items').send({ productVariantId: variantId, quantity: 1 }).expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-guest-token', added.body.data.guestToken)
      .send({ email, shippingMethodId: method.id, shippingAddress: { fullName: 'Guest Tracker', line1: '1 High St', city: 'Leeds', postcode: 'LS1 1AA', country: 'GB' } })
      .expect(201);
    orderNumber = res.body.data.orderNumber;
    orderId = res.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a guest track an order by order number + email, without leaking internals', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orders/track')
      .query({ orderNumber: orderNumber.toLowerCase(), email: email.toUpperCase() })
      .expect(200);
    expect(res.body.data.orderNumber).toBe(orderNumber);
    expect(res.body.data.status).toBe('AWAITING_PAYMENT');
    expect(res.body.data).not.toHaveProperty('email');
    expect(res.body.data).not.toHaveProperty('billingLine1');
    expect(Array.isArray(res.body.data.shipments)).toBe(true);
  });

  it('404s when the email does not match, and 400s on a malformed query', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders/track').query({ orderNumber, email: 'someone-else@example.com' }).expect(404);
    await request(app.getHttpServer()).get('/api/v1/orders/track').query({ orderNumber }).expect(400);
  });

  it('serves the invoice PDF to a guest only once the order is paid', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders/track/invoice').query({ orderNumber, email }).expect(409);
    await prisma.invoice.create({ data: { invoiceNumber: `INV-T${orderId}`, orderId, currency: 'GBP', total: 1 } });
    const res = await request(app.getHttpServer()).get('/api/v1/orders/track/invoice').query({ orderNumber, email }).expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('quotes estimated delivery dates alongside the day range', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/shipping-methods').expect(200);
    const dated = res.body.data.find((q: { estimatedDaysMin: number | null }) => q.estimatedDaysMin !== null);
    expect(dated.estimatedDeliveryFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dated.estimatedDeliveryTo >= dated.estimatedDeliveryFrom).toBe(true);
  });
});
