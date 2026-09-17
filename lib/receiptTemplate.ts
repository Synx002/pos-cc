import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const DEFAULT_NAME = 'pos-cc';
const DEFAULT_ADDR = 'Jl. Kaliwidas no 2';
const ACCENT = '#C8576A';

export type StoreInfoForReceipt = {
  store_name?: string;
  store_address?: string;
  store_phone?: string;
};

export interface ReceiptTransaction {
  transaction_id: number;
  created_at: string;
  subtotal: number;
  tax: number;
  discount?: number;
  grand_total?: number;
  transaction_status?: string;
  transaction_details?: Array<{
    quantity: number;
    unit_price: number;
    products?: { product_name?: string };
  }>;
  payments?: Array<{
    payment_method?: string;
    amount_paid?: number;
    change_amount?: number;
  }>;
}

/** ESC/POS commands for thermal printer (58mm). */
export type EscPosCommand =
  | { type: 'align'; value: 'left' | 'center' | 'right' }
  | { type: 'text'; value: string; bold?: boolean }
  | { type: 'feed'; lines?: number }
  | { type: 'drawer' }
  | { type: 'cut' };

export function buildReceiptEscPos(
  transaction: ReceiptTransaction,
  store?: StoreInfoForReceipt
): EscPosCommand[] {
  const name = store?.store_name || DEFAULT_NAME;
  const addr = store?.store_address || DEFAULT_ADDR;
  const payment = transaction.payments?.[0];
  const total = transaction.grand_total ?? transaction.subtotal;
  const dateStr = format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm', { locale: idLocale });
  const receiptNo = `#${transaction.transaction_id.toString().padStart(8, '0').slice(-8)}`;
  const statusLabel =
    transaction.transaction_status === 'completed' ? 'LUNAS' : (transaction.transaction_status ?? '-').toUpperCase();
  const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

  const thanks = 'Terima kasih atas kunjungan Anda';
  const sub = 'Sampai jumpa kembali!';

  // Printer 58mm = 32 karakter per baris.
  // padLine: kiri rata kiri, kanan rata kanan, total tepat 32 char.
  const W = 32;
  const SEP = '-'.repeat(W);
  const padLine = (left: string, right: string): string => {
    const spaces = W - left.length - right.length;
    return left + ' '.repeat(Math.max(1, spaces)) + right;
  };

  const cmds: EscPosCommand[] = [
    { type: 'align', value: 'center' },
    { type: 'text', value: name, bold: true },
    { type: 'text', value: addr },
    { type: 'text', value: dateStr },
    { type: 'feed', lines: 1 },
    { type: 'align', value: 'left' },
    { type: 'text', value: SEP },
    { type: 'text', value: `No: ${receiptNo}` },
    { type: 'text', value: `${(payment?.payment_method ?? '-').toUpperCase()}  ${statusLabel}` },
    { type: 'text', value: SEP },
  ];

  const details = transaction.transaction_details ?? [];
  let totalQty = 0;

  for (const item of details) {
    const productName = (item.products?.product_name ?? '-').slice(0, 30);
    const qty = item.quantity ?? 0;
    const unitPrice = item.unit_price ?? 0;
    const itemTotal = qty * unitPrice;
    totalQty += qty;

    // Baris 1: nama produk
    cmds.push({ type: 'text', value: productName });
    // Baris 2: qty x harga (kiri) | total (kanan)
    cmds.push({ type: 'text', value: padLine(`  ${qty} x ${rp(unitPrice)}`, rp(itemTotal)) });
  }

  const payMethod = (payment?.payment_method ?? '-').toUpperCase();

  cmds.push(
    { type: 'text', value: SEP },
    { type: 'text', value: padLine('Total Item', `${totalQty} pcs`) },
    { type: 'text', value: padLine('Total', rp(total)), bold: true },
    { type: 'text', value: SEP },
    { type: 'text', value: padLine(`Bayar (${payMethod})`, rp(payment?.amount_paid ?? total)) },
  );

  if (payment?.payment_method === 'cash') {
    cmds.push(
      { type: 'text', value: padLine('Kembalian', rp(payment.change_amount ?? 0)) },
    );
  }

  cmds.push(
    { type: 'text', value: SEP },
    { type: 'align', value: 'center' },
    { type: 'text', value: thanks },
    { type: 'text', value: sub },
    // Baris kosong agar teks footer tidak terpotong saat kertas ditarik
    { type: 'text', value: ' ' },
    { type: 'text', value: ' ' },
    { type: 'text', value: ' ' },
    { type: 'text', value: ' ' },
    { type: 'text', value: ' ' },
    { type: 'text', value: ' ' },
  );

  if (payment?.payment_method === 'cash') {
    cmds.push({ type: 'drawer' });
  }

  return cmds;
}

export function buildReceiptHtml(
  transaction: ReceiptTransaction,
  store?: StoreInfoForReceipt
): string {
  const name = store?.store_name || DEFAULT_NAME;
  const addr = store?.store_address || DEFAULT_ADDR;
  const accent = ACCENT;
  const thanks = 'Terima kasih atas kunjungan Anda';
  const sub = 'Sampai jumpa di kunjungan berikutnya';
  const payment = transaction.payments?.[0];
  const total = transaction.grand_total ?? transaction.subtotal;
  const dateStr = format(new Date(transaction.created_at), 'dd MMMM yyyy, HH:mm', {
    locale: idLocale,
  });
  const receiptNo = `#${transaction.transaction_id.toString().padStart(8, '0').slice(-8)}`;
  const statusLabel =
    transaction.transaction_status === 'completed' ? 'LUNAS' : (transaction.transaction_status ?? '-').toUpperCase();

  const itemRows =
    transaction.transaction_details
      ?.map(
        (item: any) => `
        <tr>
          <td class="item-name">${item.products?.product_name ?? '-'}</td>
          <td class="item-qty">${item.quantity}</td>
          <td class="item-price">Rp ${(item.unit_price ?? 0).toLocaleString('id-ID')}</td>
          <td class="item-total">Rp ${((item.quantity ?? 0) * (item.unit_price ?? 0)).toLocaleString('id-ID')}</td>
        </tr>`
      )
      .join('') ?? '';

  const cashSection =
    payment?.payment_method === 'cash'
      ? `
    <div class="cash-block">
      <div class="cash-row"><span>Bayar Tunai</span><span>Rp ${(payment.amount_paid ?? 0).toLocaleString('id-ID')}</span></div>
      <div class="cash-row highlight"><span>Kembalian</span><span>Rp ${(payment.change_amount ?? 0).toLocaleString('id-ID')}</span></div>
    </div>`
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, 'Segoe UI', sans-serif;
      background: #fff;
      display: flex;
      justify-content: center;
      padding: 24px 16px;
      font-size: 13px;
      color: #374151;
    }
    .receipt {
      width: 100%;
      max-width: 340px;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    /* Header */
    .receipt-top {
      height: 4px;
      background: ${accent};
    }
    .header {
      text-align: center;
      padding: 20px 20px 16px;
      border-bottom: 1px dashed #E5E7EB;
    }
    .cafe-name {
      font-size: 18px;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }
    .cafe-addr {
      font-size: 11px;
      color: #6B7280;
      margin-bottom: 10px;
    }
    .date {
      font-size: 11px;
      color: #9CA3AF;
      font-weight: 500;
    }

    /* Meta badges */
    .meta {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px;
      background: #F9FAFB;
      border-bottom: 1px solid #F3F4F6;
      gap: 12px;
    }
    .meta-item {
      flex: 1;
      text-align: center;
    }
    .meta-label {
      font-size: 9px;
      color: #9CA3AF;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 600;
      display: block;
      margin-bottom: 4px;
    }
    .meta-value {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
    }
    .meta-value.status { color: #059669; }

    /* Items table */
    .items-section {
      padding: 16px;
    }
    .items-title {
      font-size: 10px;
      font-weight: 700;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left;
      font-size: 9px;
      color: #9CA3AF;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      padding-bottom: 8px;
      border-bottom: 1px solid #E5E7EB;
    }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    td {
      padding: 10px 0;
      border-bottom: 1px solid #F3F4F6;
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    .item-name { color: #374151; font-weight: 500; }
    .item-qty { text-align: center; color: #6B7280; }
    .item-price, .item-total { text-align: right; color: #374151; }
    .item-total { font-weight: 600; }

    /* Summary */
    .summary {
      padding: 16px;
      background: #FAFAFA;
      border-top: 1px dashed #E5E7EB;
    }
    .sum-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .sum-label { color: #6B7280; }
    .sum-value { color: #374151; font-weight: 500; }
    .sum-value.discount { color: ${accent}; }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 2px solid #E5E7EB;
    }
    .total-label { font-size: 14px; font-weight: 800; color: #111827; }
    .total-value { font-size: 18px; font-weight: 800; color: ${accent}; }

    /* Cash block */
    .cash-block {
      margin: 0 16px 16px;
      padding: 12px 14px;
      background: #ECFDF5;
      border-radius: 10px;
      border: 1px solid #A7F3D0;
    }
    .cash-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .cash-row:last-child { margin-bottom: 0; }
    .cash-row.highlight span:last-child { color: #059669; font-weight: 700; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 16px 20px;
      border-top: 1px dashed #E5E7EB;
      background: #F9FAFB;
    }
    .footer-thanks {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
    }
    .footer-sub {
      font-size: 11px;
      color: #9CA3AF;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-top"></div>
    <div class="header">
      <div class="cafe-name">${name}</div>
      <div class="cafe-addr">${addr}</div>
      <div class="date">${dateStr}</div>
    </div>

    <div class="meta">
      <div class="meta-item">
        <span class="meta-label">No. Struk</span>
        <span class="meta-value">${receiptNo}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Pembayaran</span>
        <span class="meta-value">${(payment?.payment_method ?? '-').toUpperCase()}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Status</span>
        <span class="meta-value status">${statusLabel}</span>
      </div>
    </div>

    <div class="items-section">
      <div class="items-title">Daftar Pesanan</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Harga</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <div class="summary">
      <div class="sum-row"><span class="sum-label">Subtotal</span><span class="sum-value">Rp ${(transaction.subtotal ?? 0).toLocaleString('id-ID')}</span></div>
      <div class="total-row">
        <span class="total-label">Total Pembayaran</span>
        <span class="total-value">Rp ${total.toLocaleString('id-ID')}</span>
      </div>
    </div>

    ${cashSection}

    <div class="footer">
      <div class="footer-thanks">${thanks}</div>
      <div class="footer-sub">${sub}</div>
    </div>
  </div>
</body>
</html>`;
}
