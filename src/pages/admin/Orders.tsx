import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Edit2, Trash2, FileText, Search, ShoppingCart, Plus, Copy, Printer, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoImage from '@/assets/baby-land-logo.jpg';
import { useVersion } from '@/contexts/VersionContext';
import { Checkbox } from '@/components/ui/checkbox';

interface OrderItem {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_description: string | null;
  price: number;
  quantity: number;
}

interface OrderRefund {
  id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  product_description: string | null;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  shop_name: string | null;
  phone: string;
  address: string | null;
  delivery_date: string | null;
  shipping_company: string | null;
  deposit_method: string | null;
  deposit_amount: number;
  subtotal: number;
  total: number;
  status: string;
  created_at: string;
  extra_info: string | null;
  staff_member_id: string | null;
  staff_member_name: string | null;
  items?: OrderItem[];
  refunds?: OrderRefund[];
}

const statusLabels: Record<string, string> = {
  pending: 'قيد الانتظار',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

// Helper to get description multiplier (e.g., "250/10" => 10)
const getDescriptionMultiplier = (description: string | null): number => {
  if (!description) return 1;
  const match = description.match(/(\d+)\/(\d+)/);
  if (match) {
    return parseInt(match[2]);
  }
  return 1;
};

// Calculate item total with description multiplier
const calculateItemTotal = (item: OrderItem): number => {
  const multiplier = getDescriptionMultiplier(item.product_description);
  return item.price * item.quantity * multiplier;
};

const Orders = () => {
  const [searchParams] = useSearchParams();
  const { activeVersion } = useVersion();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [searchCode, setSearchCode] = useState(searchParams.get('search') || searchParams.get('order') || '');
  const [addProductCode, setAddProductCode] = useState('');
  const [addRefundCode, setAddRefundCode] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [duplicateCustomer, setDuplicateCustomer] = useState({
    customer_name: '',
    phone: '',
    shop_name: '',
    address: '',
    delivery_date: '',
    shipping_company: '',
    deposit_method: '',
    deposit_amount: 0,
    extra_info: '',
  });

  useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('order') || '';
    setSearchCode(q);
  }, [searchParams]);

  useEffect(() => {
    if (activeVersion) {
      loadOrders();

      const channel = supabase
        .channel('orders-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          loadOrders();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeVersion]);

  const loadOrders = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('version_id', activeVersion.id)
      .order('order_number', { ascending: false });

    if (error) {
      toast.error('فشل في تحميل الطلبات');
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const loadOrderItems = async (orderId: string) => {
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    return data || [];
  };

  const loadOrderRefunds = async (orderId: string): Promise<OrderRefund[]> => {
    const { data } = await supabase
      .from('order_refunds')
      .select('*')
      .eq('order_id', orderId);
    return (data || []) as OrderRefund[];
  };

  const handleView = async (order: Order) => {
    const [items, refunds] = await Promise.all([loadOrderItems(order.id), loadOrderRefunds(order.id)]);
    setSelectedOrder({ ...order, items, refunds });
    setViewDialogOpen(true);
  };

  const handleEdit = async (order: Order) => {
    const [items, refunds] = await Promise.all([loadOrderItems(order.id), loadOrderRefunds(order.id)]);
    setSelectedOrder({ ...order, items, refunds });
    setEditDialogOpen(true);
  };

  const handleDuplicate = async (order: Order) => {
    const items = await loadOrderItems(order.id);
    setSelectedOrder({ ...order, items });
    setDuplicateCustomer({
      customer_name: '',
      phone: '',
      shop_name: '',
      address: '',
      delivery_date: '',
      shipping_company: '',
      deposit_method: '',
      deposit_amount: 0,
      extra_info: '',
    });
    setDuplicateDialogOpen(true);
  };

  const handleCreateDuplicateOrder = async () => {
    if (!selectedOrder || !selectedOrder.items || !duplicateCustomer.customer_name || !duplicateCustomer.phone) {
      toast.error('يرجى إدخال اسم العميل ورقم الهاتف');
      return;
    }

    if (!activeVersion) {
      toast.error('لا توجد نسخة نشطة');
      return;
    }

    // Calculate subtotal
    const subtotal = selectedOrder.items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const total = subtotal - (duplicateCustomer.deposit_amount || 0);

    // Get next order number for this version
    const { data: nextOrderNum } = await supabase.rpc('get_next_order_number', { p_version_id: activeVersion.id });
    const orderNumber = nextOrderNum || 1;

    // Create new order
    const { data: newOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: duplicateCustomer.customer_name,
        phone: duplicateCustomer.phone,
        shop_name: duplicateCustomer.shop_name || null,
        address: duplicateCustomer.address || null,
        delivery_date: duplicateCustomer.delivery_date || null,
        shipping_company: duplicateCustomer.shipping_company || null,
        deposit_method: duplicateCustomer.deposit_method || null,
        deposit_amount: duplicateCustomer.deposit_amount || 0,
        extra_info: duplicateCustomer.extra_info || null,
        subtotal,
        total,
        status: 'pending',
        version_id: activeVersion.id,
        order_number: orderNumber,
      })
      .select()
      .single();

    if (orderError || !newOrder) {
      toast.error('فشل في إنشاء الطلب');
      return;
    }

    // Insert order items (this will trigger stock deduction via the trigger)
    const orderItemsToInsert = selectedOrder.items.map(item => ({
      order_id: newOrder.id,
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      product_description: item.product_description,
      price: item.price,
      quantity: item.quantity,
      version_id: activeVersion.id,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsError) {
      toast.error('فشل في إضافة المنتجات للطلب');
      // Delete the order if items failed
      await supabase.from('orders').delete().eq('id', newOrder.id);
      return;
    }

    toast.success(`تم إنشاء طلب جديد رقم #${newOrder.order_number}`);
    setDuplicateDialogOpen(false);
    loadOrders();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;

    // First get order items to restore stock
    const items = await loadOrderItems(id);
    
    // Restore stock for all items
    for (const item of items) {
      const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
      if (product) {
        await supabase.from('products').update({
          stock_quantity: product.stock_quantity + item.quantity
        }).eq('id', item.product_id);
      }
    }

    // Clean up refund rows linked to this order (no FK cascade)
    await supabase.from('order_refunds').delete().eq('order_id', id);

    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      toast.error('فشل في حذف الطلب');
    } else {
      // Reset order number sequence to continue from max existing order number
      await supabase.rpc('reset_order_number_sequence');
      toast.success('تم حذف الطلب');
      loadOrders();
    }
  };

  const handleAddProductToOrder = async () => {
    if (!selectedOrder || !addProductCode.trim() || !activeVersion) return;

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('code', addProductCode.trim())
      .eq('version_id', activeVersion.id)
      .maybeSingle();

    if (productError || !product) {
      toast.error('المنتج غير موجود');
      return;
    }

    // Deduct stock
    await supabase.from('products').update({
      stock_quantity: product.stock_quantity - 1
    }).eq('id', product.id);

    const { error } = await supabase.from('order_items').insert({
      order_id: selectedOrder.id,
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      product_description: product.description,
      price: product.price,
      quantity: 1,
      version_id: activeVersion.id,
    });

    if (error) {
      toast.error('فشل في إضافة المنتج');
      // Restore stock on failure
      await supabase.from('products').update({
        stock_quantity: product.stock_quantity
      }).eq('id', product.id);
    } else {
      toast.success('تم إضافة المنتج');
      const items = await loadOrderItems(selectedOrder.id);
      setSelectedOrder({ ...selectedOrder, items });
      setAddProductCode('');
      
      // Update order totals with description multiplier
      const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
      const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
      await supabase.from('orders').update({
        subtotal: newSubtotal,
        total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
      }).eq('id', selectedOrder.id);
      
      loadOrders();
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!selectedOrder) return;

    // Get item to restore stock
    const itemToRemove = selectedOrder.items?.find(i => i.id === itemId);
    
    const { error } = await supabase.from('order_items').delete().eq('id', itemId);
    if (error) {
      toast.error('فشل في حذف المنتج');
    } else {
      // Restore stock
      if (itemToRemove) {
        const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', itemToRemove.product_id).single();
        if (product) {
          await supabase.from('products').update({
            stock_quantity: product.stock_quantity + itemToRemove.quantity
          }).eq('id', itemToRemove.product_id);
        }
      }
      
      const items = await loadOrderItems(selectedOrder.id);
      setSelectedOrder({ ...selectedOrder, items });
      
      // Update order totals with description multiplier
      const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
      const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
      await supabase.from('orders').update({
        subtotal: newSubtotal,
        total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
      }).eq('id', selectedOrder.id);
      
      loadOrders();
    }
  };

  const handleUpdateItemQuantity = async (itemId: string, quantity: number) => {
    if (!selectedOrder || quantity < 1) return;

    // Get current item to calculate stock difference
    const currentItem = selectedOrder.items?.find(i => i.id === itemId);
    if (!currentItem) return;
    
    const quantityDiff = quantity - currentItem.quantity;
    
    // Update stock (negative diff means more items, so deduct; positive means fewer items, so restore)
    const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', currentItem.product_id).single();
    if (product) {
      await supabase.from('products').update({
        stock_quantity: product.stock_quantity - quantityDiff
      }).eq('id', currentItem.product_id);
    }

    const { error } = await supabase.from('order_items').update({ quantity }).eq('id', itemId);
    if (error) {
      toast.error('فشل في تحديث الكمية');
      // Restore stock on failure
      if (product) {
        await supabase.from('products').update({
          stock_quantity: product.stock_quantity
        }).eq('id', currentItem.product_id);
      }
    } else {
      const items = await loadOrderItems(selectedOrder.id);
      setSelectedOrder({ ...selectedOrder, items });
      
      // Update order totals with description multiplier
      const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
      const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
      await supabase.from('orders').update({
        subtotal: newSubtotal,
        total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
      }).eq('id', selectedOrder.id);
      
      loadOrders();
    }
  };

  const handleAddRefundToOrder = async () => {
    if (!selectedOrder || !addRefundCode.trim() || !activeVersion) return;

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('code', addRefundCode.trim())
      .eq('version_id', activeVersion.id)
      .maybeSingle();

    if (productError || !product) {
      toast.error('المنتج غير موجود');
      return;
    }

    const { error } = await supabase.from('order_refunds').insert({
      order_id: selectedOrder.id,
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      product_description: product.description,
      price: product.price,
      quantity: 1,
      version_id: activeVersion.id,
    });

    if (error) {
      toast.error('فشل في إضافة الاسترجاع');
      return;
    }

    toast.success('تم إضافة منتج الاسترجاع');
    const refunds = await loadOrderRefunds(selectedOrder.id);
    const items = selectedOrder.items || [];
    const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const refundTotal = refunds.reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
    await supabase.from('orders').update({
      subtotal: newSubtotal,
      total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
    }).eq('id', selectedOrder.id);
    setSelectedOrder({ ...selectedOrder, refunds });
    setAddRefundCode('');
    loadOrders();
  };

  const handleUpdateRefundQuantity = async (refundId: string, quantity: number) => {
    if (!selectedOrder || quantity < 1) return;
    const { error } = await supabase.from('order_refunds').update({ quantity }).eq('id', refundId);
    if (error) {
      toast.error('فشل في تحديث الكمية');
      return;
    }
    const refunds = await loadOrderRefunds(selectedOrder.id);
    const items = selectedOrder.items || [];
    const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const refundTotal = refunds.reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
    await supabase.from('orders').update({
      subtotal: newSubtotal,
      total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
    }).eq('id', selectedOrder.id);
    setSelectedOrder({ ...selectedOrder, refunds });
    loadOrders();
  };

  const handleRemoveRefund = async (refundId: string) => {
    if (!selectedOrder) return;
    const { error } = await supabase.from('order_refunds').delete().eq('id', refundId);
    if (error) {
      toast.error('فشل في حذف الاسترجاع');
      return;
    }
    const refunds = await loadOrderRefunds(selectedOrder.id);
    const items = selectedOrder.items || [];
    const newSubtotal = items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const refundTotal = refunds.reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
    await supabase.from('orders').update({
      subtotal: newSubtotal,
      total: newSubtotal - refundTotal - selectedOrder.deposit_amount,
    }).eq('id', selectedOrder.id);
    setSelectedOrder({ ...selectedOrder, refunds });
    loadOrders();
  };

  const getLogoBase64 = (): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve('');
      img.src = logoImage;
    });
  };

  const generateInvoice = async (order: Order) => {
    if (!order.items) return;

    const refunds = order.refunds ?? (await loadOrderRefunds(order.id));
    const logoBase64 = await getLogoBase64();

    // Calculate totals with description multiplier
    const calculatedSubtotal = order.items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const refundTotal = refunds.reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
    const calculatedTotal = calculatedSubtotal - refundTotal - order.deposit_amount;

    const invoiceHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة رقم ${order.order_number}</title>
        <style>
          body { font-family: 'Cairo', Arial, sans-serif; padding: 20px; direction: rtl; }
          .header { text-align: center; margin-bottom: 30px; }
          .header img { width: 150px; height: auto; object-fit: contain; margin-bottom: 10px; }
          .header h1 { color: #00bfff; margin: 0; }
          .header p { color: #ff69b4; }
          .info { margin-bottom: 20px; }
          .info p { margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
          th { background: #00bfff; color: white; }
          .totals { text-align: left; }
          .totals p { margin: 5px 0; }
          .totals .total { font-size: 1.2em; font-weight: bold; color: #00bfff; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoBase64 ? `<img src="${logoBase64}" alt="Babyland Logo" />` : ''}
          <h1>Babyland</h1>
          <p>Kids in Style</p>
          <h2>فاتورة رقم ${order.order_number}</h2>
        </div>
        <div class="info">
          <p><strong>العميل:</strong> ${order.customer_name}</p>
          ${order.shop_name ? `<p><strong>المحل:</strong> ${order.shop_name}</p>` : ''}
          <p><strong>الهاتف:</strong> ${order.phone}</p>
          ${order.address ? `<p><strong>العنوان:</strong> ${order.address}</p>` : ''}
          <p><strong>التاريخ:</strong> ${new Date(order.created_at).toLocaleDateString('ar-EG')}</p>
          ${order.staff_member_name ? `<p><strong>البائع:</strong> ${order.staff_member_name}</p>` : ''}
          ${order.extra_info ? `<p><strong>ملاحظات:</strong> ${order.extra_info}</p>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th>الكود</th>
              <th>المنتج</th>
              <th>السعر</th>
              <th>الكمية</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${[...order.items].sort((a, b) => a.product_code.localeCompare(b.product_code, undefined, { numeric: true })).map(item => {
              // Parse description for quantity calculation (e.g., "200/20" means pack of 20)
              let displayQuantity = item.quantity;
              const multiplier = getDescriptionMultiplier(item.product_description);
              if (multiplier > 1) {
                displayQuantity = item.quantity * multiplier;
              }
              const itemTotal = calculateItemTotal(item);
              return `
                <tr>
                  <td>${item.product_code}</td>
                  <td>${item.product_name}</td>
                  <td>${item.price} ج.م</td>
                  <td>${displayQuantity}</td>
                  <td>${itemTotal.toFixed(2)} ج.م</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${refunds.length > 0 ? `
          <h3 style="color:#dc2626;margin-top:20px;">منتجات الاسترجاع</h3>
          <table>
            <thead>
              <tr>
                <th>الكود</th>
                <th>المنتج</th>
                <th>السعر</th>
                <th>الكمية</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${[...refunds].sort((a, b) => a.product_code.localeCompare(b.product_code, undefined, { numeric: true })).map(r => {
                const m = getDescriptionMultiplier(r.product_description);
                const dq = m > 1 ? r.quantity * m : r.quantity;
                const rt = calculateItemTotal(r as unknown as OrderItem);
                return `
                  <tr>
                    <td>${r.product_code}</td>
                    <td>${r.product_name}</td>
                    <td>${r.price} ج.م</td>
                    <td>${dq}</td>
                    <td>${rt.toFixed(2)} ج.م</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : ''}
        <div class="totals">
          <p>الإجمالي الفرعي: ${calculatedSubtotal.toFixed(2)} ج.م</p>
          ${refundTotal > 0 ? `<p style="color:#dc2626;">إجمالي الاسترجاع: -${refundTotal.toFixed(2)} ج.م</p>` : ''}
          ${order.deposit_amount > 0 ? `<p>العربون (${order.deposit_method}): -${order.deposit_amount.toFixed(2)} ج.م</p>` : ''}
          <p class="total">المطلوب: ${calculatedTotal.toFixed(2)} ج.م</p>
        </div>
      </body>
      </html>
    `;

    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(invoiceHtml);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
        return;
      }
    }

    // Mobile: inject print/close buttons into the HTML and open as a full-page overlay
    const mobileHtml = invoiceHtml.replace('</body>', `
      <div style="position:fixed;bottom:0;left:0;right:0;display:flex;gap:10px;padding:12px;background:#fff;border-top:2px solid #000;z-index:10000;justify-content:center;">
        <button onclick="window.print()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;">🖨️ طباعة</button>
        <button onclick="document.getElementById('mobile-invoice-overlay').remove()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;">✕ إغلاق</button>
      </div>
    </body>`);

    const blob = new Blob([mobileHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open in a new tab — works on most mobile browsers
    const newTab = window.open(url, '_blank');
    if (!newTab) {
      // If popup blocked, use location redirect
      window.location.href = url;
    }
    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const handlePrintSelected = async () => {
    const ordersToPrint = filteredOrders.filter(o => selectedOrderIds.has(o.id));
    if (ordersToPrint.length === 0) {
      toast.error('اختر طلب واحد على الأقل');
      return;
    }

    // Load items + refunds for all selected orders
    const ordersWithItems = await Promise.all(
      ordersToPrint.map(async (order) => {
        const [items, refunds] = await Promise.all([
          loadOrderItems(order.id),
          loadOrderRefunds(order.id),
        ]);
        return { ...order, items, refunds };
      })
    );

    const logoBase64 = await getLogoBase64();

    const allInvoicesHtml = ordersWithItems.map(order => {
      const calculatedSubtotal = order.items.reduce((sum: number, item: OrderItem) => sum + calculateItemTotal(item), 0);
      const refundTotal = (order.refunds || []).reduce((sum: number, r: OrderRefund) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
      const calculatedTotal = calculatedSubtotal - refundTotal - order.deposit_amount;

      return `
        <div style="page-break-after: always;">
          <div class="header">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Babyland Logo" />` : ''}
            <h1>Babyland</h1>
            <p>Kids in Style</p>
            <h2>فاتورة رقم ${order.order_number}</h2>
          </div>
          <div class="info">
            <p><strong>العميل:</strong> ${order.customer_name}</p>
            ${order.shop_name ? `<p><strong>المحل:</strong> ${order.shop_name}</p>` : ''}
            <p><strong>الهاتف:</strong> ${order.phone}</p>
            ${order.address ? `<p><strong>العنوان:</strong> ${order.address}</p>` : ''}
            <p><strong>التاريخ:</strong> ${new Date(order.created_at).toLocaleDateString('ar-EG')}</p>
            ${order.staff_member_name ? `<p><strong>البائع:</strong> ${order.staff_member_name}</p>` : ''}
            ${order.extra_info ? `<p><strong>ملاحظات:</strong> ${order.extra_info}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>الكود</th>
                <th>المنتج</th>
                <th>السعر</th>
                <th>الكمية</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${[...order.items].sort((a: OrderItem, b: OrderItem) => a.product_code.localeCompare(b.product_code, undefined, { numeric: true })).map((item: OrderItem) => {
                let displayQuantity = item.quantity;
                const multiplier = getDescriptionMultiplier(item.product_description);
                if (multiplier > 1) displayQuantity = item.quantity * multiplier;
                const itemTotal = calculateItemTotal(item);
                return `
                  <tr>
                    <td>${item.product_code}</td>
                    <td>${item.product_name}</td>
                    <td>${item.price} ج.م</td>
                    <td>${displayQuantity}</td>
                    <td>${itemTotal.toFixed(2)} ج.م</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ${(order.refunds || []).length > 0 ? `
            <h3 style="color:#dc2626;margin-top:20px;">منتجات الاسترجاع</h3>
            <table>
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>المنتج</th>
                  <th>السعر</th>
                  <th>الكمية</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${[...(order.refunds || [])].sort((a: OrderRefund, b: OrderRefund) => a.product_code.localeCompare(b.product_code, undefined, { numeric: true })).map((r: OrderRefund) => {
                  const m = getDescriptionMultiplier(r.product_description);
                  const dq = m > 1 ? r.quantity * m : r.quantity;
                  const rt = calculateItemTotal(r as unknown as OrderItem);
                  return `
                    <tr>
                      <td>${r.product_code}</td>
                      <td>${r.product_name}</td>
                      <td>${r.price} ج.م</td>
                      <td>${dq}</td>
                      <td>${rt.toFixed(2)} ج.م</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : ''}
          <div class="totals">
            <p>الإجمالي الفرعي: ${calculatedSubtotal.toFixed(2)} ج.م</p>
            ${refundTotal > 0 ? `<p style="color:#dc2626;">إجمالي الاسترجاع: -${refundTotal.toFixed(2)} ج.م</p>` : ''}
            ${order.deposit_amount > 0 ? `<p>العربون (${order.deposit_method}): -${order.deposit_amount.toFixed(2)} ج.م</p>` : ''}
            <p class="total">المطلوب: ${calculatedTotal.toFixed(2)} ج.م</p>
          </div>
        </div>
      `;
    }).join('');

    const fullHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>طباعة فواتير</title>
        <style>
          body { font-family: 'Cairo', Arial, sans-serif; padding: 20px; direction: rtl; }
          .header { text-align: center; margin-bottom: 30px; }
          .header img { width: 150px; height: auto; object-fit: contain; margin-bottom: 10px; }
          .header h1 { color: #00bfff; margin: 0; }
          .header p { color: #ff69b4; }
          .info { margin-bottom: 20px; }
          .info p { margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
          th { background: #00bfff; color: white; }
          .totals { text-align: left; }
          .totals p { margin: 5px 0; }
          .totals .total { font-size: 1.2em; font-weight: bold; color: #00bfff; }
          @media print { div[style*="page-break-after"]:last-child { page-break-after: avoid; } }
        </style>
      </head>
      <body>
        ${allInvoicesHtml}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const filteredOrders = searchCode
    ? orders.filter((o) => 
        o.order_number.toString().includes(searchCode) ||
        o.phone.includes(searchCode) ||
        o.customer_name.toLowerCase().includes(searchCode.toLowerCase()) ||
        (o.shop_name && o.shop_name.toLowerCase().includes(searchCode.toLowerCase()))
      )
    : orders;

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        {selectedOrderIds.size > 0 && (
          <Button onClick={handlePrintSelected} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة ({selectedOrderIds.size}) فاتورة
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث برقم الطلب أو الهاتف أو الاسم أو المحل..."
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          className="pr-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filteredOrders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد طلبات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              checked={selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">تحديد الكل</span>
          </div>
          {filteredOrders.map((order) => (
            <Card key={order.id} className={`hover:shadow-baby transition-shadow ${selectedOrderIds.has(order.id) ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Checkbox
                      checked={selectedOrderIds.has(order.id)}
                      onCheckedChange={() => toggleOrderSelection(order.id)}
                    />
                    <div className="text-3xl font-bold text-primary">#{order.order_number}</div>
                    <div>
                      <p className="font-bold">{order.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{order.phone}</p>
                      <p className="text-xs text-muted-foreground">
                        📅 {new Date(order.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      {order.staff_member_name ? (
                        <Badge className="bg-purple-100 text-purple-800 mt-1">
                          👷 موظف: {order.staff_member_name}
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-800 mt-1">
                          👤 عميل
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <Badge className={statusColors[order.status]}>{statusLabels[order.status]}</Badge>
                      <p className="text-lg font-bold text-primary mt-1">{order.total.toFixed(2)} ج.م</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleView(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEdit(order)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDuplicate(order)} title="نسخ الطلب">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const items = await loadOrderItems(order.id);
                        generateInvoice({ ...order, items });
                      }}>
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(order.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>طلب رقم #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>العميل:</strong> {selectedOrder.customer_name}</div>
                <div><strong>الهاتف:</strong> {selectedOrder.phone}</div>
                {selectedOrder.shop_name && <div><strong>المحل:</strong> {selectedOrder.shop_name}</div>}
                {selectedOrder.address && <div><strong>العنوان:</strong> {selectedOrder.address}</div>}
                {selectedOrder.delivery_date && <div><strong>تاريخ التسليم:</strong> {selectedOrder.delivery_date}</div>}
                {selectedOrder.shipping_company && <div><strong>شركة الشحن:</strong> {selectedOrder.shipping_company}</div>}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-right">المنتج</th>
                      <th className="p-3 text-right">السعر</th>
                      <th className="p-3 text-right">الكمية</th>
                      <th className="p-3 text-right">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item) => {
                      const itemTotal = calculateItemTotal(item);
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="p-3">
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">#{item.product_code}</p>
                          </td>
                          <td className="p-3">{item.price} ج.م</td>
                          <td className="p-3">{item.quantity}</td>
                          <td className="p-3">{itemTotal.toFixed(2)} ج.م</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedOrder.refunds && selectedOrder.refunds.length > 0 && (
                <div className="border rounded-lg overflow-hidden border-destructive/40">
                  <div className="bg-destructive/10 px-3 py-2 font-bold text-destructive text-sm">منتجات الاسترجاع</div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3 text-right">المنتج</th>
                        <th className="p-3 text-right">السعر</th>
                        <th className="p-3 text-right">الكمية</th>
                        <th className="p-3 text-right">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.refunds.map((r) => {
                        const rt = calculateItemTotal(r as unknown as OrderItem);
                        return (
                          <tr key={r.id} className="border-t">
                            <td className="p-3">
                              <p className="font-medium">{r.product_name}</p>
                              <p className="text-xs text-muted-foreground">#{r.product_code}</p>
                            </td>
                            <td className="p-3">{r.price} ج.م</td>
                            <td className="p-3">{r.quantity}</td>
                            <td className="p-3">{rt.toFixed(2)} ج.م</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-left space-y-1">
                {(() => {
                  const calcSubtotal = selectedOrder.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
                  const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
                  const calcTotal = calcSubtotal - refundTotal - selectedOrder.deposit_amount;
                  return (
                    <>
                      <p>الإجمالي الفرعي: {calcSubtotal.toFixed(2)} ج.م</p>
                      {refundTotal > 0 && (
                        <p className="text-destructive">إجمالي الاسترجاع: -{refundTotal.toFixed(2)} ج.م</p>
                      )}
                      {selectedOrder.deposit_amount > 0 && (
                        <p className="text-secondary">العربون: -{selectedOrder.deposit_amount.toFixed(2)} ج.م</p>
                      )}
                      <p className="text-xl font-bold text-primary">المطلوب: {calcTotal.toFixed(2)} ج.م</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Order Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>نسخ طلب رقم #{selectedOrder?.order_number} لعميل جديد</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* New Customer Information */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">معلومات العميل الجديد</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">اسم العميل *</label>
                    <Input
                      value={duplicateCustomer.customer_name}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, customer_name: e.target.value })}
                      placeholder="أدخل اسم العميل"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">رقم الهاتف *</label>
                    <Input
                      value={duplicateCustomer.phone}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, phone: e.target.value })}
                      placeholder="أدخل رقم الهاتف"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">اسم المحل</label>
                    <Input
                      value={duplicateCustomer.shop_name}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, shop_name: e.target.value })}
                      placeholder="أدخل اسم المحل"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">العنوان</label>
                    <Input
                      value={duplicateCustomer.address}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, address: e.target.value })}
                      placeholder="أدخل العنوان"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">تاريخ التسليم</label>
                    <Input
                      type="date"
                      value={duplicateCustomer.delivery_date}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, delivery_date: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">شركة الشحن</label>
                    <Input
                      value={duplicateCustomer.shipping_company}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, shipping_company: e.target.value })}
                      placeholder="أدخل شركة الشحن"
                    />
                  </div>
                </div>
              </div>

              {/* Deposit Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">معلومات العربون</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">طريقة الدفع</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={duplicateCustomer.deposit_method}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, deposit_method: e.target.value })}
                    >
                      <option value="">بدون عربون</option>
                      <option value="cash">كاش</option>
                      <option value="instapay">انستاباي</option>
                      <option value="vodafone_cash">فودافون كاش</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">قيمة العربون</label>
                    <Input
                      type="number"
                      min="0"
                      value={duplicateCustomer.deposit_amount}
                      onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, deposit_amount: parseFloat(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">ملاحظات إضافية</label>
                  <Input
                    value={duplicateCustomer.extra_info}
                    onChange={(e) => setDuplicateCustomer({ ...duplicateCustomer, extra_info: e.target.value })}
                    placeholder="أي ملاحظات إضافية"
                  />
                </div>
              </div>

              {/* Products Preview */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">المنتجات (من الطلب الأصلي)</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3 text-right">المنتج</th>
                        <th className="p-3 text-right">السعر</th>
                        <th className="p-3 text-right">الكمية</th>
                        <th className="p-3 text-right">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item) => {
                        const itemTotal = calculateItemTotal(item);
                        return (
                          <tr key={item.id} className="border-t">
                            <td className="p-3">
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">#{item.product_code}</p>
                            </td>
                            <td className="p-3">{item.price} ج.م</td>
                            <td className="p-3">{item.quantity}</td>
                            <td className="p-3">{itemTotal.toFixed(2)} ج.م</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="text-left space-y-1 border-t pt-4">
                {(() => {
                  const calcSubtotal = selectedOrder.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
                  const calcTotal = calcSubtotal - (duplicateCustomer.deposit_amount || 0);
                  return (
                    <>
                      <p>الإجمالي الفرعي: {calcSubtotal.toFixed(2)} ج.م</p>
                      {duplicateCustomer.deposit_amount > 0 && (
                        <p className="text-secondary">العربون: -{duplicateCustomer.deposit_amount.toFixed(2)} ج.م</p>
                      )}
                      <p className="text-xl font-bold text-primary">المطلوب: {calcTotal.toFixed(2)} ج.م</p>
                    </>
                  );
                })()}
              </div>

              <Button onClick={handleCreateDuplicateOrder} className="w-full gap-2">
                <Copy className="h-4 w-4" />
                إنشاء طلب جديد
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل طلب رقم #{selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Information Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">معلومات العميل</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">اسم العميل</label>
                    <Input
                      value={selectedOrder.customer_name}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, customer_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">رقم الهاتف</label>
                    <Input
                      value={selectedOrder.phone}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, phone: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">اسم المحل</label>
                    <Input
                      value={selectedOrder.shop_name || ''}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, shop_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">العنوان</label>
                    <Input
                      value={selectedOrder.address || ''}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">تاريخ التسليم</label>
                    <Input
                      type="date"
                      value={selectedOrder.delivery_date || ''}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, delivery_date: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">شركة الشحن</label>
                    <Input
                      value={selectedOrder.shipping_company || ''}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, shipping_company: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Deposit Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">معلومات العربون</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">طريقة الدفع</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={selectedOrder.deposit_method || ''}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, deposit_method: e.target.value || null })}
                    >
                      <option value="">بدون عربون</option>
                      <option value="cash">كاش</option>
                      <option value="instapay">انستاباي</option>
                      <option value="vodafone_cash">فودافون كاش</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">قيمة العربون</label>
                    <Input
                      type="number"
                      min="0"
                      value={selectedOrder.deposit_amount}
                      onChange={(e) => setSelectedOrder({ ...selectedOrder, deposit_amount: parseFloat(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={async () => {
                    const calcSubtotal = selectedOrder.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
                    const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
                    const calcTotal = calcSubtotal - refundTotal - selectedOrder.deposit_amount;
                    
                    const { error } = await supabase.from('orders').update({
                      customer_name: selectedOrder.customer_name,
                      phone: selectedOrder.phone,
                      shop_name: selectedOrder.shop_name,
                      address: selectedOrder.address,
                      delivery_date: selectedOrder.delivery_date,
                      shipping_company: selectedOrder.shipping_company,
                      deposit_method: selectedOrder.deposit_method,
                      deposit_amount: selectedOrder.deposit_amount,
                      total: calcTotal,
                    }).eq('id', selectedOrder.id);

                    if (error) {
                      toast.error('فشل في حفظ التعديلات');
                    } else {
                      // Update the deposits table as well
                      // First, check if a deposit exists for this order
                      const { data: existingDeposit } = await supabase
                        .from('deposits')
                        .select('id')
                        .eq('order_id', selectedOrder.id)
                        .maybeSingle();

                      if (selectedOrder.deposit_amount > 0 && selectedOrder.deposit_method) {
                        if (existingDeposit) {
                          // Update existing deposit
                          await supabase.from('deposits').update({
                            amount: selectedOrder.deposit_amount,
                            method: selectedOrder.deposit_method,
                            customer_name: selectedOrder.customer_name,
                          }).eq('order_id', selectedOrder.id);
                        } else {
                          // Create new deposit - need to get version_id from the order
                          const { data: orderVersion } = await supabase
                            .from('orders')
                            .select('version_id')
                            .eq('id', selectedOrder.id)
                            .single();
                          
                          if (orderVersion) {
                            await supabase.from('deposits').insert({
                              order_id: selectedOrder.id,
                              order_number: selectedOrder.order_number,
                              customer_name: selectedOrder.customer_name,
                              amount: selectedOrder.deposit_amount,
                              method: selectedOrder.deposit_method,
                              version_id: orderVersion.version_id,
                            });
                          }
                        }
                      } else if (existingDeposit) {
                        // Remove deposit if amount is 0 or no method selected
                        await supabase.from('deposits').delete().eq('order_id', selectedOrder.id);
                      }

                      toast.success('تم حفظ التعديلات');
                      loadOrders();
                    }
                  }}
                >
                  حفظ معلومات العميل والعربون
                </Button>
              </div>

              {/* Products Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">المنتجات</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="أدخل كود المنتج"
                    value={addProductCode}
                    onChange={(e) => setAddProductCode(e.target.value)}
                    dir="ltr"
                  />
                  <Button onClick={handleAddProductToOrder} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3 text-right">المنتج</th>
                        <th className="p-3 text-right">السعر</th>
                        <th className="p-3 text-right">الكمية</th>
                        <th className="p-3 text-right">الإجمالي</th>
                        <th className="p-3 text-right">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items?.map((item) => {
                        const itemTotal = calculateItemTotal(item);
                        return (
                          <tr key={item.id} className="border-t">
                            <td className="p-3">
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">#{item.product_code}</p>
                            </td>
                            <td className="p-3">{item.price} ج.م</td>
                            <td className="p-3">
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQuantity(item.id, parseInt(e.target.value) || 1)}
                                className="w-20"
                                dir="ltr"
                              />
                            </td>
                            <td className="p-3 font-bold">{itemTotal.toFixed(2)} ج.م</td>
                            <td className="p-3">
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refund Section */}
              <div className="border rounded-lg p-4 space-y-4 border-destructive/40 bg-destructive/5">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Undo2 className="h-5 w-5 text-destructive" />
                  <h3 className="font-bold text-lg text-destructive">منتجات الاسترجاع</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  يتم خصم إجمالي الاسترجاع من إجمالي الطلب. لا يؤثر الاسترجاع على المخزون.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="أدخل كود المنتج المراد استرجاعه"
                    value={addRefundCode}
                    onChange={(e) => setAddRefundCode(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRefundToOrder(); } }}
                    dir="ltr"
                  />
                  <Button onClick={handleAddRefundToOrder} variant="destructive" className="gap-2">
                    <Undo2 className="h-4 w-4" />
                    إضافة استرجاع
                  </Button>
                </div>
                {selectedOrder.refunds && selectedOrder.refunds.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-3 text-right">المنتج</th>
                          <th className="p-3 text-right">السعر</th>
                          <th className="p-3 text-right">الكمية</th>
                          <th className="p-3 text-right">الإجمالي</th>
                          <th className="p-3 text-right">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.refunds.map((r) => {
                          const rt = calculateItemTotal(r as unknown as OrderItem);
                          return (
                            <tr key={r.id} className="border-t">
                              <td className="p-3">
                                <p className="font-medium">{r.product_name}</p>
                                <p className="text-xs text-muted-foreground">#{r.product_code}</p>
                              </td>
                              <td className="p-3">{r.price} ج.م</td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="1"
                                  value={r.quantity}
                                  onChange={(e) => handleUpdateRefundQuantity(r.id, parseInt(e.target.value) || 1)}
                                  className="w-20"
                                  dir="ltr"
                                />
                              </td>
                              <td className="p-3 font-bold text-destructive">-{rt.toFixed(2)} ج.م</td>
                              <td className="p-3">
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemoveRefund(r.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="text-left space-y-1 border-t pt-4">
                {(() => {
                  const calcSubtotal = selectedOrder.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
                  const refundTotal = (selectedOrder.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
                  const calcTotal = calcSubtotal - refundTotal - selectedOrder.deposit_amount;
                  return (
                    <>
                      <p>الإجمالي الفرعي: {calcSubtotal.toFixed(2)} ج.م</p>
                      {refundTotal > 0 && (
                        <p className="text-destructive">إجمالي الاسترجاع: -{refundTotal.toFixed(2)} ج.م</p>
                      )}
                      {selectedOrder.deposit_amount > 0 && (
                        <p className="text-secondary">العربون: -{selectedOrder.deposit_amount.toFixed(2)} ج.م</p>
                      )}
                      <p className="text-xl font-bold text-primary">المطلوب: {calcTotal.toFixed(2)} ج.م</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
