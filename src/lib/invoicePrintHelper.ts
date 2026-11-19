import { supabase } from '@/integrations/supabase/client';
import { silentPrintHtml } from '@/lib/silentPrint';
import logoImage from '@/assets/baby-land-logo.jpg';
import QRCode from 'qrcode';

export interface InvoiceOrderItem {
  id?: string;
  order_id?: string;
  product_id?: string | null;
  product_code: string;
  product_name: string;
  product_description: string | null;
  price: number;
  quantity: number;
}

export interface InvoiceOrderRefund {
  id?: string;
  order_id?: string;
  product_id?: string | null;
  product_code: string;
  product_name: string;
  product_description: string | null;
  price: number;
  quantity: number;
}

export interface InvoiceOrder {
  id: string;
  order_number: number;
  customer_name: string;
  shop_name?: string | null;
  phone: string;
  address?: string | null;
  branch?: string | null;
  delivery_date?: string | null;
  shipping_company?: string | null;
  deposit_method?: string | null;
  deposit_amount?: number | null;
  subtotal?: number;
  total?: number;
  status?: string;
  created_at: string;
  extra_info?: string | null;
  staff_member_name?: string | null;
  items?: InvoiceOrderItem[];
  refunds?: InvoiceOrderRefund[];
  qrCodeBase64?: string;
}

// Helper to get description multiplier (e.g., "250/10" => 10)
export const getDescriptionMultiplier = (description: string | null | undefined): number => {
  if (!description) return 1;
  const match = description.match(/(\d+)\/(\d+)/);
  if (match) {
    return parseInt(match[2], 10);
  }
  return 1;
};

// Calculate item total with description multiplier
export const calculateItemTotal = (item: { price: number; quantity: number; product_description?: string | null }): number => {
  const multiplier = getDescriptionMultiplier(item.product_description);
  return (Number(item.price) || 0) * (Number(item.quantity) || 0) * multiplier;
};

let cachedLogoBase64: string | null = null;

export const getLogoBase64 = (): Promise<string> => {
  if (cachedLogoBase64) return Promise.resolve(cachedLogoBase64);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        cachedLogoBase64 = dataUrl;
        resolve(dataUrl);
      } catch (e) {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = logoImage;
  });
};

export const generateQRCodeBase64 = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, { margin: 1, width: 140 });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return '';
  }
};

/**
 * Builds the HTML content for a single invoice in the batch.
 */
export const buildSingleInvoiceHtml = (order: InvoiceOrder, logoBase64: string): string => {
  const items = order.items || [];
  const refunds = order.refunds || [];

  const calculatedSubtotal = items.length > 0
    ? items.reduce((sum, item) => sum + calculateItemTotal(item), 0)
    : Number(order.subtotal || 0);

  const refundTotal = refunds.reduce((sum, r) => sum + calculateItemTotal(r), 0);
  const deposit = Number(order.deposit_amount || 0);
  const calculatedTotal = calculatedSubtotal - refundTotal - deposit;

  const orderBranch = order.branch || (order.extra_info?.includes('نيلي') ? 'نيلي' : order.extra_info?.includes('العبور') ? 'العبور' : null);

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('ar-EG')
    : '';

  return `
    <div style="page-break-after: always; padding: 10px; box-sizing: border-box;">
      <div class="header" style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #00bfff;padding-bottom:8px;margin-bottom:10px;">
        <div class="header-brand" style="text-align:right;">
          ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-height:55px;width:auto;" />` : ''}
        </div>
        <div class="header-title" style="text-align:center;flex:1;">
          <h2 style="margin:0;font-size:16px;color:#00bfff;font-weight:bold;">فاتورة رقم ${order.order_number}</h2>
        </div>
        <div class="header-qr" style="text-align:center;">
          ${order.qrCodeBase64 ? `
            <img src="${order.qrCodeBase64}" alt="QR Code" style="width:75px;height:75px;border:1px solid #ccc;padding:2px;border-radius:4px;background:#fff;" />
          ` : ''}
        </div>
      </div>
      <div class="info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 15px;margin-bottom:10px;background:#f9fafb;padding:8px 10px;border-radius:6px;border:1px solid #eee;">
        <div>
          <p style="margin:2px 0;font-size:11px;"><strong>العميل:</strong> ${order.customer_name || ''}</p>
          ${order.shop_name ? `<p style="margin:2px 0;font-size:11px;"><strong>المحل:</strong> ${order.shop_name}</p>` : ''}
          <p style="margin:2px 0;font-size:11px;"><strong>الهاتف:</strong> ${order.phone || ''}</p>
          ${order.address ? `<p style="margin:2px 0;font-size:11px;"><strong>العنوان:</strong> ${order.address}</p>` : ''}
          ${orderBranch ? `<p style="margin:2px 0;font-size:11px;"><strong>الفرع:</strong> ${orderBranch}</p>` : ''}
        </div>
        <div>
          <p style="margin:2px 0;font-size:11px;"><strong>التاريخ:</strong> ${formattedDate}</p>
          ${order.delivery_date ? `<p style="margin:2px 0;font-size:11px;"><strong>تاريخ التسليم:</strong> ${order.delivery_date}</p>` : ''}
          ${order.shipping_company ? `<p style="margin:2px 0;font-size:11px;"><strong>شركة الشحن:</strong> ${order.shipping_company}</p>` : ''}
          ${order.staff_member_name ? `<p style="margin:2px 0;font-size:11px;"><strong>البائع:</strong> ${order.staff_member_name}</p>` : ''}
          ${order.extra_info ? `<p style="margin:2px 0;font-size:11px;"><strong>ملاحظات:</strong> ${order.extra_info}</p>` : ''}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
        <thead>
          <tr>
            <th style="background:#00bfff;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الكود</th>
            <th style="background:#00bfff;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">المنتج</th>
            <th style="background:#00bfff;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">السعر</th>
            <th style="background:#00bfff;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الكمية</th>
            <th style="background:#00bfff;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${[...items].sort((a, b) => (a.product_code || '').localeCompare(b.product_code || '', undefined, { numeric: true })).map(item => {
            let displayQuantity = item.quantity;
            const multiplier = getDescriptionMultiplier(item.product_description);
            if (multiplier > 1) {
              displayQuantity = item.quantity * multiplier;
            }
            const itemTotal = calculateItemTotal(item);
            return `
              <tr>
                <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${item.product_code}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${item.product_name}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${item.price} ج.م</td>
                <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${displayQuantity}</td>
                <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${itemTotal.toFixed(2)} ج.م</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${refunds.length > 0 ? `
        <h3 style="color:#dc2626;margin:8px 0 4px;font-size:12px;">منتجات الاسترجاع</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
          <thead>
            <tr>
              <th style="background:#dc2626;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الكود</th>
              <th style="background:#dc2626;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">المنتج</th>
              <th style="background:#dc2626;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">السعر</th>
              <th style="background:#dc2626;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الكمية</th>
              <th style="background:#dc2626;color:white;font-weight:bold;padding:5px 6px;border:1px solid #ddd;font-size:11px;text-align:right;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${[...refunds].sort((a, b) => (a.product_code || '').localeCompare(b.product_code || '', undefined, { numeric: true })).map(r => {
              const m = getDescriptionMultiplier(r.product_description);
              const dq = m > 1 ? r.quantity * m : r.quantity;
              const rt = calculateItemTotal(r);
              return `
                <tr>
                  <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${r.product_code}</td>
                  <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${r.product_name}</td>
                  <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${r.price} ج.م</td>
                  <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${dq}</td>
                  <td style="border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:right;">${rt.toFixed(2)} ج.م</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : ''}
      <div class="totals" style="text-align:left;margin-top:6px;font-size:11px;">
        <p style="margin:2px 0;">الإجمالي الفرعي: ${calculatedSubtotal.toFixed(2)} ج.م</p>
        ${refundTotal > 0 ? `<p style="color:#dc2626;margin:2px 0;">إجمالي الاسترجاع: -${refundTotal.toFixed(2)} ج.م</p>` : ''}
        ${deposit > 0 ? `<p style="margin:2px 0;">العربون (${order.deposit_method || 'عربون'}): -${deposit.toFixed(2)} ج.م</p>` : ''}
        <p class="total" style="font-size:1.15em;font-weight:bold;color:#00bfff;margin:2px 0;">المطلوب: ${calculatedTotal.toFixed(2)} ج.م</p>
      </div>
      <div class="footer" style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #ccc; text-align: center; font-size: 11px; color: #444;">
        <p style="margin: 2px 0; font-weight: bold;">أرقام التواصل: 01001608562 | 01093979300</p>
      </div>
    </div>
  `;
};

/**
 * Executes batch printing of invoices.
 * Fetches required items and refunds in bulk if not already loaded,
 * generates QR codes, and dispatches to silentPrintHtml (desktop) or blob popup (mobile).
 */
export const printInvoicesBatch = async (orders: InvoiceOrder[]): Promise<boolean> => {
  if (!orders || orders.length === 0) {
    return false;
  }

  // Sort orders ascending by order number so printing is sequential
  const sortedOrders = [...orders].sort((a, b) => a.order_number - b.order_number);

  // Check if items/refunds need to be loaded
  const ordersNeedingData = sortedOrders.filter(o => !o.items);
  let itemsByOrderId: Record<string, InvoiceOrderItem[]> = {};
  let refundsByOrderId: Record<string, InvoiceOrderRefund[]> = {};

  if (ordersNeedingData.length > 0) {
    const ids = ordersNeedingData.map(o => o.id);

    // Fetch order items and refunds in parallel in chunks if necessary (Supabase `.in` handles hundreds safely)
    const [itemsRes, refundsRes] = await Promise.all([
      supabase.from('order_items').select('*').in('order_id', ids),
      supabase.from('order_refunds').select('*').in('order_id', ids),
    ]);

    (itemsRes.data || []).forEach((item: any) => {
      if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
      itemsByOrderId[item.order_id].push(item);
    });

    (refundsRes.data || []).forEach((refund: any) => {
      if (!refundsByOrderId[refund.order_id]) refundsByOrderId[refund.order_id] = [];
      refundsByOrderId[refund.order_id].push(refund);
    });
  }

  const logoBase64 = await getLogoBase64();

  // Populate items, refunds, and QR code for each order
  const ordersReady = await Promise.all(
    sortedOrders.map(async (order) => {
      const items = order.items ?? (itemsByOrderId[order.id] || []);
      const refunds = order.refunds ?? (refundsByOrderId[order.id] || []);
      const qrCodeBase64 = order.qrCodeBase64 || (await generateQRCodeBase64(`${window.location.origin}/edit-order?id=${order.id}`));
      return {
        ...order,
        items,
        refunds,
        qrCodeBase64,
      };
    })
  );

  const allInvoicesHtml = ordersReady.map(order => buildSingleInvoiceHtml(order, logoBase64)).join('');

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>طباعة فواتير</title>
      <style>
        body { font-family: 'Cairo', Arial, sans-serif; padding: 10px; margin: 0; direction: rtl; font-size: 12px; line-height: 1.3; color: #222; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: right; font-size: 11px; }
        th { background: #00bfff; color: white; font-weight: bold; padding: 5px 6px; }
        tr:nth-child(even) { background-color: #fafafa; }
        @media print {
          body { padding: 4px; font-size: 11px; }
          div[style*="page-break-after"]:last-child { page-break-after: avoid; }
          @page { margin: 5mm; }
        }
      </style>
    </head>
    <body>
      ${allInvoicesHtml}
    </body>
    </html>
  `;

  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isMobile) {
    silentPrintHtml(fullHtml);
    return true;
  }

  // Mobile: inject print/close buttons into the HTML and open in a new window/tab
  const mobileHtml = fullHtml.replace('</body>', `
    <div style="position:fixed;bottom:0;left:0;right:0;display:flex;gap:10px;padding:12px;background:#fff;border-top:2px solid #00bfff;z-index:10000;justify-content:center;">
      <button onclick="window.print()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#00bfff;color:#fff;border:none;border-radius:8px;cursor:pointer;">🖨️ طباعة الفواتير</button>
      <button onclick="window.close()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;">✕ إغلاق</button>
    </div>
  </body>`);

  const blob = new Blob([mobileHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const newTab = window.open(url, '_blank');
  if (!newTab) {
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  return true;
};
