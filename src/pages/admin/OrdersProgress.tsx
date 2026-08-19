import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Eye, Printer, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoImage from '@/assets/baby-land-logo.jpg';
import { useVersion } from '@/contexts/VersionContext';

interface OrderItem {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_description: string | null;
  price: number;
  quantity: number;
  fulfilled: boolean;
  cancelled: boolean;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  shop_name: string | null;
  phone: string;
  address: string | null;
  branch?: string | null;
  delivery_date: string | null;
  shipping_company: string | null;
  deposit_method: string | null;
  deposit_amount: number;
  subtotal: number;
  total: number;
  status: string;
  progress_status: string;
  created_at: string;
  extra_info: string | null;
  staff_member_name: string | null;
  items?: OrderItem[];
}

const getDescriptionMultiplier = (description: string | null): number => {
  if (!description) return 1;
  const match = description.match(/(\d+)\/(\d+)/);
  return match ? parseInt(match[2]) : 1;
};

const calculateItemTotal = (item: OrderItem): number => {
  const multiplier = getDescriptionMultiplier(item.product_description);
  return item.price * item.quantity * multiplier;
};

const statusMeta: Record<string, { label: string; cls: string }> = {
  finished: { label: 'منتهي', cls: 'bg-green-100 text-green-800' },
  partial: { label: 'جزئي', cls: 'bg-blue-100 text-blue-800' },
  unfinished: { label: 'غير منتهي', cls: 'bg-amber-100 text-amber-800' },
};

const OrdersProgress = () => {
  const { activeVersion } = useVersion();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unfinished' | 'partial' | 'finished'>('unfinished');
  const [search, setSearch] = useState('');
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [includeDeposit, setIncludeDeposit] = useState(true);

  useEffect(() => {
    if (!activeVersion) return;
    loadOrders();
    const channel = supabase
      .channel('orders-progress-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeVersion]);

  const loadOrders = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('version_id', activeVersion.id)
      .order('order_number', { ascending: false });
    if (error) toast.error('فشل تحميل الطلبات');
    else setOrders((data as any) || []);
    setLoading(false);
  };

  const loadOrderItems = async (orderId: string): Promise<OrderItem[]> => {
    const { data } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    return (data as any) || [];
  };

  const handleOpen = async (order: Order) => {
    const items = await loadOrderItems(order.id);
    setSelectedOrder({ ...order, items });
    setDialogOpen(true);
  };

  const updateItemFlags = async (item: OrderItem, patch: Partial<Pick<OrderItem, 'fulfilled' | 'cancelled'>>) => {
    if (!selectedOrder) return;
    const { error } = await supabase
      .from('order_items')
      .update(patch as any)
      .eq('id', item.id);
    if (error) {
      toast.error('فشل التحديث');
      return;
    }
    const updatedItems = selectedOrder.items!.map(i =>
      i.id === item.id ? { ...i, ...patch } : i
    );
    setSelectedOrder({ ...selectedOrder, items: updatedItems });
    await syncProgressStatus(selectedOrder.id, updatedItems);
  };

  const toggleItemFulfilled = (item: OrderItem) => {
    const newFulfilled = !item.fulfilled;
    updateItemFlags(item, { fulfilled: newFulfilled, cancelled: newFulfilled ? false : item.cancelled });
  };

  const toggleItemCancelled = (item: OrderItem) => {
    const newCancelled = !item.cancelled;
    updateItemFlags(item, { cancelled: newCancelled, fulfilled: newCancelled ? false : item.fulfilled });
  };

  const syncProgressStatus = async (orderId: string, items: OrderItem[]) => {
    // An item is "resolved" if it is fulfilled OR cancelled.
    // Order is finished only if every item is resolved AND at least one is fulfilled.
    const fulfilledCount = items.filter(i => i.fulfilled).length;
    const resolvedCount = items.filter(i => i.fulfilled || i.cancelled).length;
    let newStatus: 'finished' | 'unfinished' | 'partial' = 'unfinished';
    if (items.length > 0 && resolvedCount === items.length && fulfilledCount > 0) {
      newStatus = 'finished';
    } else if (fulfilledCount > 0 || resolvedCount > 0) {
      newStatus = 'partial';
    }
    await supabase.from('orders').update({ progress_status: newStatus } as any).eq('id', orderId);
    setSelectedOrder(prev => prev ? { ...prev, progress_status: newStatus } : prev);
    loadOrders();
  };

  const markAllFulfilled = async () => {
    if (!selectedOrder?.items) return;
    const ids = selectedOrder.items.filter(i => !i.cancelled).map(i => i.id);
    if (ids.length === 0) return;
    await supabase.from('order_items').update({ fulfilled: true } as any).in('id', ids);
    const updated = selectedOrder.items.map(i => i.cancelled ? i : { ...i, fulfilled: true });
    setSelectedOrder({ ...selectedOrder, items: updated });
    await syncProgressStatus(selectedOrder.id, updated);
    toast.success('تم تأكيد كل المنتجات');
  };

  const getLogoBase64 = (): Promise<string> =>
    new Promise((resolve) => {
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

  const openPrintDialog = () => {
    if (!selectedOrder?.items) return;
    const fulfilledItems = selectedOrder.items.filter(i => i.fulfilled);
    if (fulfilledItems.length === 0) {
      toast.error('لا توجد منتجات مؤكدة للطباعة');
      return;
    }
    setIncludeDeposit(true);
    setPrintDialogOpen(true);
  };

  const printFulfilledInvoice = async () => {
    if (!selectedOrder?.items) return;
    const fulfilledItems = selectedOrder.items.filter(i => i.fulfilled);
    if (fulfilledItems.length === 0) return;
    const order = selectedOrder;
    setPrintDialogOpen(false);
    const logoBase64 = await getLogoBase64();
    const subtotal = fulfilledItems.reduce((s, i) => s + calculateItemTotal(i), 0);
    const depositToApply = includeDeposit ? (order.deposit_amount || 0) : 0;
    const total = subtotal - depositToApply;

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>فاتورة ${order.order_number}</title>
<style>
body{font-family:'Cairo',Arial,sans-serif;padding:20px;direction:rtl;}
.header{text-align:center;margin-bottom:30px;}
.header img{width:150px;height:auto;margin-bottom:10px;}
.header h1{color:#00bfff;margin:0;}
.header p{color:#ff69b4;}
.info p{margin:5px 0;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
th,td{border:1px solid #ddd;padding:10px;text-align:right;}
th{background:#00bfff;color:white;}
.totals{text-align:left;}
.totals .total{font-size:1.2em;font-weight:bold;color:#00bfff;}
</style></head><body>
<div class="header">
${logoBase64 ? `<img src="${logoBase64}" alt="Babyland" />` : ''}
<h1>Babyland</h1><p>Kids in Style</p>
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
<thead><tr><th>الكود</th><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
<tbody>
${[...fulfilledItems].sort((a,b)=>a.product_code.localeCompare(b.product_code,undefined,{numeric:true})).map(item => {
  const mult = getDescriptionMultiplier(item.product_description);
  const displayQty = mult > 1 ? item.quantity * mult : item.quantity;
  return `<tr><td>${item.product_code}</td><td>${item.product_name}</td><td>${item.price} ج.م</td><td>${displayQty}</td><td>${calculateItemTotal(item).toFixed(2)} ج.م</td></tr>`;
}).join('')}
</tbody></table>
<div class="totals">
<p>الإجمالي الفرعي: ${subtotal.toFixed(2)} ج.م</p>
${depositToApply > 0 ? `<p>العربون (${order.deposit_method || ''}): -${depositToApply.toFixed(2)} ج.م</p>` : ''}
<p class="total">المطلوب: ${total.toFixed(2)} ج.م</p>
</div>
</body></html>`;

    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile) {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 500);
        return;
      }
    }
    const mobileHtml = html.replace('</body>', `
      <div style="position:fixed;bottom:0;left:0;right:0;display:flex;gap:10px;padding:12px;background:#fff;border-top:2px solid #000;z-index:10000;justify-content:center;">
        <button onclick="window.print()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#2563eb;color:#fff;border:none;border-radius:8px;">🖨️ طباعة</button>
        <button onclick="window.close()" style="flex:1;max-width:200px;padding:12px;font-size:16px;font-weight:bold;background:#ef4444;color:#fff;border:none;border-radius:8px;">✕ إغلاق</button>
      </div></body>`);
    const blob = new Blob([mobileHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, '_blank');
    if (!newTab) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const filteredOrders = orders.filter(o => {
    if (filter !== 'all' && o.progress_status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      String(o.order_number).includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.phone.includes(q) ||
      (o.shop_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold gradient-text">تقدم الطلبات</h1>
        <div className="relative w-full md:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الطلب أو العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="unfinished">غير منتهية</TabsTrigger>
          <TabsTrigger value="partial">جزئية</TabsTrigger>
          <TabsTrigger value="finished">منتهية</TabsTrigger>
          <TabsTrigger value="all">الكل</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <p className="text-center text-muted-foreground">جارِ التحميل...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-center text-muted-foreground">لا توجد طلبات</p>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((o) => (
            <Card key={o.id} className="hover:shadow-md transition">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">#{o.order_number}</Badge>
                  {(() => {
                    const b = o.branch || (o.extra_info?.includes('نيلي') ? 'نيلي' : o.extra_info?.includes('العبور') ? 'العبور' : null);
                    return b ? (
                      <Badge className={cn("text-xs font-semibold", b === 'نيلي' ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200")}>
                        🏢 {b}
                      </Badge>
                    ) : null;
                  })()}
                  <div>
                    <p className="font-semibold">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.shop_name || o.phone} • {new Date(o.created_at).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={(statusMeta[o.progress_status] || statusMeta.unfinished).cls}>
                    {(statusMeta[o.progress_status] || statusMeta.unfinished).label}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => handleOpen(o)}>
                    <Eye className="h-4 w-4 ml-1" /> فتح
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              طلب رقم #{selectedOrder?.order_number} — {selectedOrder?.customer_name}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={markAllFulfilled}>
                  <CheckCircle2 className="h-4 w-4 ml-1" /> تأكيد الكل
                </Button>
                <Button size="sm" variant="outline" onClick={openPrintDialog}>
                  <Printer className="h-4 w-4 ml-1" /> طباعة فاتورة المؤكد
                </Button>
                <Badge className={(statusMeta[selectedOrder.progress_status] || statusMeta.unfinished).cls}>
                  {(statusMeta[selectedOrder.progress_status] || statusMeta.unfinished).label}
                </Badge>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-right">الكود</th>
                      <th className="p-2 text-right">المنتج</th>
                      <th className="p-2 text-right">الكمية</th>
                      <th className="p-2 text-right">الإجمالي</th>
                      <th className="p-2 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item) => {
                      const mult = getDescriptionMultiplier(item.product_description);
                      const dispQty = mult > 1 ? item.quantity * mult : item.quantity;
                      const rowCls = item.fulfilled
                        ? 'bg-green-50'
                        : item.cancelled
                        ? 'bg-red-50 line-through text-muted-foreground'
                        : '';
                      return (
                        <tr key={item.id} className={`border-t ${rowCls}`}>
                          <td className="p-2">{item.product_code}</td>
                          <td className="p-2">{item.product_name}</td>
                          <td className="p-2">{dispQty}</td>
                          <td className="p-2">{calculateItemTotal(item).toFixed(2)} ج.م</td>
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant={item.fulfilled ? 'default' : 'outline'}
                                onClick={() => toggleItemFulfilled(item)}
                                className={item.fulfilled ? 'bg-green-600 hover:bg-green-700' : ''}
                                title="تأكيد"
                              >
                                {item.fulfilled ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant={item.cancelled ? 'default' : 'outline'}
                                onClick={() => toggleItemCancelled(item)}
                                className={item.cancelled ? 'bg-red-600 hover:bg-red-700' : ''}
                                title="إلغاء"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedOrder.deposit_amount > 0 && (
                <p className="text-sm text-muted-foreground">
                  العربون: {selectedOrder.deposit_amount.toFixed(2)} ج.م ({selectedOrder.deposit_method})
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إعدادات الطباعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedOrder && selectedOrder.deposit_amount > 0 ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="include-deposit" className="font-semibold">
                    خصم العربون من الإجمالي
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    العربون: {selectedOrder.deposit_amount.toFixed(2)} ج.م
                  </p>
                </div>
                <Switch
                  id="include-deposit"
                  checked={includeDeposit}
                  onCheckedChange={setIncludeDeposit}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لا يوجد عربون لهذا الطلب.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>إلغاء</Button>
            <Button onClick={printFulfilledInvoice}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersProgress;
