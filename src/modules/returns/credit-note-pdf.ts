import PDFDocument = require('pdfkit');
import { resolve } from 'path';
import { formatMoney } from '../../common/currency';

const FONTS = resolve(process.cwd(), 'assets/fonts');

export interface CreditNoteData {
  currency: string;
  creditNoteNumber: string;
  orderNumber: string;
  refundNumber?: string | null;
  issuedAt: Date;
  customerEmail: string;
  amount: number;
  reason: string;
  company: { name: string; legalName: string; address: string; vatNumber: string | null; email: string; phone: string };
  billing: { name: string; company: string | null; address: string };
}

export function buildCreditNotePdf(data: CreditNoteData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Credit note ${data.creditNoteNumber}`, Author: data.company.legalName } });
  doc.registerFont('R', `${FONTS}/NotoSans-Regular.ttf`);
  doc.registerFont('B', `${FONTS}/NotoSans-Bold.ttf`);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolvePromise) => doc.on('end', () => resolvePromise(Buffer.concat(chunks))));
  const text = (value: string, x: number, y: number, options: { font?: 'R' | 'B'; size?: number; color?: string; width?: number; align?: 'left' | 'right' } = {}) => {
    doc.font(options.font ?? 'R').fontSize(options.size ?? 8.5).fillColor(options.color ?? '#101827')
      .text(value, x, y, { width: options.width ?? 500, align: options.align ?? 'left' });
  };
  const rect = (x: number, y: number, width: number, height: number, fill?: string, stroke?: string) => {
    doc.rect(x, y, width, height);
    if (fill && stroke) doc.fillAndStroke(fill, stroke);
    else if (fill) doc.fill(fill);
    else if (stroke) doc.lineWidth(0.6).stroke(stroke);
  };
  const money = (amount: number) => formatMoney(amount, data.currency);
  const margin = 36;
  const width = 595.28 - margin * 2;
  const date = data.issuedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  rect(0, 0, 595.28, 60, '#111827');
  text('CREDIT NOTE', margin, 21, { font: 'B', size: 22, color: '#ffffff', width: 240 });
  text(data.creditNoteNumber, 395, 24, { font: 'B', size: 16, color: '#ffffff', width: 164, align: 'right' });
  text(data.company.name.toUpperCase(), margin, 80, { font: 'B', size: 13, width: 260 });
  text(data.company.legalName, margin, 98, { font: 'B', size: 8.5, width: 280 });
  text(data.company.address, margin, 112, { size: 7.5, width: 280 });
  text([data.company.vatNumber ? `VAT reg. no. ${data.company.vatNumber}` : '', data.company.email].filter(Boolean).join(' · '), margin, 127, { size: 7.5, width: 280 });

  rect(margin, 155, width / 2 - 10, 80, '#f4f6f9', '#e2e6ec');
  rect(margin + width / 2 + 10, 155, width / 2 - 10, 80, '#f4f6f9', '#e2e6ec');
  text('ORDER REFERENCE', margin + 12, 168, { font: 'B', size: 6, color: '#6b7585', width: 220 });
  text(data.orderNumber, margin + 12, 182, { font: 'B', size: 14, width: 220 });
  text(`Issued ${date}`, margin + 12, 209, { font: 'B', size: 10, width: 220 });
  text('REFUND REFERENCE', margin + width / 2 + 22, 168, { font: 'B', size: 6, color: '#6b7585', width: 220 });
  text(data.refundNumber ?? 'N/A', margin + width / 2 + 22, 182, { font: 'B', size: 12, width: 220 });
  text(data.customerEmail, margin + width / 2 + 22, 209, { font: 'B', size: 9, width: 220 });

  rect(margin, 255, width, 80, '#fafbfc', '#e2e6ec');
  text('CREDITED TO', margin + 12, 268, { font: 'B', size: 6, color: '#6b7585', width: 150 });
  text(data.billing.company || data.billing.name, margin + 12, 282, { font: 'B', size: 12, width: 250 });
  text(data.billing.address.replace(/\n/g, ' · '), margin + 12, 301, { size: 8, color: '#4b5565', width: width - 24 });

  rect(margin, 365, width, 72, '#e6f7f0', '#bfe5d4');
  text('TOTAL CREDIT AMOUNT', margin + 14, 380, { font: 'B', size: 8, color: '#12703a', width: 200 });
  text(money(data.amount), margin + width - 220, 378, { font: 'B', size: 26, color: '#12703a', width: 200, align: 'right' });
  text(`Reason: ${data.reason}`, margin + 14, 416, { size: 8, color: '#12703a', width: width - 28 });

  text('This credit note records the refund issued for the order above. The amount is returned to the original payment method.', margin, 470, { size: 8, color: '#4b5565', width });
  rect(0, 788, 595.28, 53.89, '#111827');
  text([data.company.phone, data.company.email].filter(Boolean).join(' · '), margin, 808, { font: 'B', size: 7, color: '#dfe6ee', width: width - 20 });
  doc.end();
  return done;
}