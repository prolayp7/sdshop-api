import { CatalogAlertsService } from './catalog-alerts.service';

describe('CatalogAlertsService', () => {
  const prisma = {
    productVariant: { findUnique: jest.fn(), updateMany: jest.fn() },
    wishlistItem: { findMany: jest.fn() },
    newsletterSubscriber: { findMany: jest.fn() },
  };
  const email = { send: jest.fn() };
  const originalOperationsEmail = process.env.OPERATIONS_EMAIL;
  let service: CatalogAlertsService;

  beforeEach(() => {
    jest.clearAllMocks();
    email.send.mockResolvedValue(true);
    service = new CatalogAlertsService(prisma as never, email as never);
  });

  afterAll(() => {
    if (originalOperationsEmail === undefined) delete process.env.OPERATIONS_EMAIL;
    else process.env.OPERATIONS_EMAIL = originalOperationsEmail;
  });

  it('claims and sends a low-stock alert only once', async () => {
    process.env.OPERATIONS_EMAIL = 'ops@example.com';
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 12,
      title: '512 GB',
      stockQty: 2,
      lowStockThreshold: 5,
      lowStockAlertSentAt: null,
      status: 'ACTIVE',
      product: { title: 'SD Card', status: 'ACTIVE', receiveLowStockAlert: true },
    });
    prisma.productVariant.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await service.checkLowStock(12);
    await service.checkLowStock(12);

    expect(prisma.productVariant.updateMany).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith('ops@example.com', expect.stringContaining('Low stock'), expect.any(String));
  });

  it('sends restock alerts only to active newsletter subscribers', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    prisma.wishlistItem.findMany.mockResolvedValue([{
      productVariant: { title: '512 GB', product: { title: 'SD Card', slug: 'sd-card' } },
      wishlist: { user: { email: 'customer@example.com', status: 'ACTIVE' } },
    }]);
    prisma.newsletterSubscriber.findMany.mockResolvedValue([{
      email: 'customer@example.com',
      unsubscribeToken: 'unsubscribe-token',
    }]);

    await service.variantChanged(
      { id: 12, stockQty: 0, lowStockThreshold: 5, price: 20, salePrice: null } as never,
      { id: 12, stockQty: 8, lowStockThreshold: 5, price: 20, salePrice: null } as never,
    );

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0]).toBe('customer@example.com');
    expect(email.send.mock.calls[0][2]).toContain('newsletter/unsubscribe?token=unsubscribe-token');
  });

  it('does not send wishlist alerts to unsubscribed customers', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    prisma.wishlistItem.findMany.mockResolvedValue([{
      productVariant: { title: '512 GB', product: { title: 'SD Card', slug: 'sd-card' } },
      wishlist: { user: { email: 'customer@example.com', status: 'ACTIVE' } },
    }]);
    prisma.newsletterSubscriber.findMany.mockResolvedValue([]);

    await service.variantChanged(
      { id: 12, stockQty: 0, lowStockThreshold: 5, price: 20, salePrice: null } as never,
      { id: 12, stockQty: 8, lowStockThreshold: 5, price: 20, salePrice: null } as never,
    );

    expect(email.send).not.toHaveBeenCalled();
  });

  it('sends a price-drop alert when the effective variant price decreases', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    prisma.wishlistItem.findMany.mockResolvedValue([{
      productVariant: { title: '512 GB', product: { title: 'SD Card', slug: 'sd-card' } },
      wishlist: { user: { email: 'customer@example.com', status: 'ACTIVE' } },
    }]);
    prisma.newsletterSubscriber.findMany.mockResolvedValue([{
      email: 'customer@example.com',
      unsubscribeToken: 'unsubscribe-token',
    }]);

    await service.variantChanged(
      { id: 12, stockQty: 8, lowStockThreshold: 5, price: 30, salePrice: null } as never,
      { id: 12, stockQty: 8, lowStockThreshold: 5, price: 20, salePrice: null } as never,
    );

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][1]).toContain('Price drop');
    expect(email.send.mock.calls[0][2]).toContain('newsletter/unsubscribe?token=unsubscribe-token');
  });
});