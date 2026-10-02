import { buildCreditNotePdf } from './credit-note-pdf';

describe('buildCreditNotePdf', () => {
  it('renders a PDF credit note with the supplied number', async () => {
    const pdf = await buildCreditNotePdf({
      currency: 'GBP',
      creditNoteNumber: 'CN-000123',
      orderNumber: 'SD-100123',
      refundNumber: 'RF-123',
      issuedAt: new Date('2026-03-01T00:00:00.000Z'),
      customerEmail: 'customer@example.com',
      amount: 42.5,
      reason: 'Returned item',
      company: { name: 'SDShop', legalName: 'SDShop Ltd', address: '1 Main Street', vatNumber: null, email: 'support@example.com', phone: '0123456789' },
      billing: { name: 'Test Customer', company: null, address: '1 Main Street, London, N1 1AA' },
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('CN-000123');
  });
});