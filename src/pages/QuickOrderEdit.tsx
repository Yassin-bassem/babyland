import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Save, ArrowRight, Plus, Trash2, Undo2, CheckCircle2, User, Phone, MapPin, Truck, Calendar } from 'lucide-react';
import logoImage from '@/assets/baby-land-logo.jpg';

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
  branch?: string | null;
  delivery_date: string | null;
  shipping_company: string | null;
  deposit_method: string | null;
  deposit_amount: number;
  subtotal: number;
  total: number;
  status: string;
  created_at: string;
  extra_info: string | null;
  staff_member_name: string | null;
  version_id: string;
  items?: OrderItem[];
  refunds?: OrderRefund[];
}

const getDescriptionMultiplier = (description: string | null): number => {
  if (!description) return 1;
  const match = description.match(/(\d+)\/(\d+)/);
  return match ? parseInt(match[2], 10) : 1;
};

const calculateItemTotal = (item: OrderItem): number => {
  const multiplier = getDescriptionMultiplier(item.product_description);
  return item.price * item.quantity * multiplier;
};

const QuickOrderEdit = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('id');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addProductCode, setAddProductCode] = useState('');
  const [addRefundCode, setAddRefundCode] = useState('');
  const [editorName, setEditorName] = useState('');

  useEffect(() => {
    // Check staff session name
    const staffStr = sessionStorage.getItem('babyland_staff');
    if (staffStr) {
      try {
        const staff = JSON.parse(staffStr);
        if (staff?.name) setEditorName(staff.name);
      } catch (e) {}
    } else if (sessionStorage.getItem('babyland_admin') === 'true') {
      setEditorName('الإدارة');
    }
  }, []);

  const loadOrder = async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError || !orderData) {
        toast.error('لم يتم العثور على هذا الطلب');
        setLoading(false);
        return;
      }

      const [itemsRes, refundsRes] = await Promise.all([
        supabase.from('order_items').select('*').eq('order_id', orderId),
        supabase.from('order_refunds').select('*').eq('order_id', orderId),
      ]);

      const loadedOrder: Order = {
        ...orderData,
        items: itemsRes.data || [],
        refunds: (refundsRes.data || []) as OrderRefund[],
      };

      setOrder(loadedOrder);
      if (!editorName && loadedOrder.staff_member_name) {
        setEditorName(loadedOrder.staff_member_name);
      }
    } catch (err) {
      console.error('Error loading order for editing:', err);
      toast.error('حدث خطأ في تحميل الطلب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const handleAddProduct = async () => {
    if (!order || !addProductCode.trim()) return;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('code', addProductCode.trim())
      .eq('version_id', order.version_id)
      .maybeSingle();

    if (error || !product) {
      toast.error('المنتج غير موجود في هذه النسخة');
      return;
    }

    // Deduct stock quantity
    await supabase.from('products').update({
      stock_quantity: Math.max(0, product.stock_quantity - 1)
    }).eq('id', product.id);

    const { error: insertErr } = await supabase.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      product_description: product.description,
      price: product.price,
      quantity: 1,
      version_id: order.version_id,
    });

    if (insertErr) {
      toast.error('فشل في إضافة المنتج');
    } else {
      toast.success(`تمت إضافة "${product.name}" للطلب`);
      setAddProductCode('');
      loadOrder();
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!order) return;
    const itemToRemove = order.items?.find(i => i.id === itemId);

    const { error } = await supabase.from('order_items').delete().eq('id', itemId);
    if (error) {
      toast.error('فشل في حذف المنتج');
    } else {
      if (itemToRemove) {
        const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', itemToRemove.product_id).single();
        if (product) {
          await supabase.from('products').update({
            stock_quantity: product.stock_quantity + itemToRemove.quantity
          }).eq('id', itemToRemove.product_id);
        }
      }
      toast.success('تم حذف المنتج من الطلب');
      loadOrder();
    }
  };

  const handleUpdateItemQuantity = async (itemId: string, quantity: number) => {
    if (!order || quantity < 1) return;
    const currentItem = order.items?.find(i => i.id === itemId);
    if (!currentItem) return;

    const diff = quantity - currentItem.quantity;
    const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', currentItem.product_id).single();
    if (product) {
      await supabase.from('products').update({
        stock_quantity: Math.max(0, product.stock_quantity - diff)
      }).eq('id', currentItem.product_id);
    }

    const { error } = await supabase.from('order_items').update({ quantity }).eq('id', itemId);
    if (error) toast.error('فشل تحديث الكمية');
    else loadOrder();
  };

  const handleAddRefund = async () => {
    if (!order || !addRefundCode.trim()) return;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('code', addRefundCode.trim())
      .eq('version_id', order.version_id)
      .maybeSingle();

    if (error || !product) {
      toast.error('المنتج غير موجود');
      return;
    }

    const { error: insertErr } = await supabase.from('order_refunds').insert({
      order_id: order.id,
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      product_description: product.description,
      price: product.price,
      quantity: 1,
      version_id: order.version_id,
    });

    if (insertErr) toast.error('فشل إضافة الاسترجاع');
    else {
      toast.success('تمت إضافة منتج الاسترجاع');
      setAddRefundCode('');
      loadOrder();
    }
  };

  const handleUpdateRefundQuantity = async (refundId: string, quantity: number) => {
    if (quantity < 1) return;
    const { error } = await supabase.from('order_refunds').update({ quantity }).eq('id', refundId);
    if (error) toast.error('فشل تحديث الكمية');
    else loadOrder();
  };

  const handleRemoveRefund = async (refundId: string) => {
    const { error } = await supabase.from('order_refunds').delete().eq('id', refundId);
    if (error) toast.error('فشل الحذف');
    else loadOrder();
  };

  const handleSaveChanges = async () => {
    if (!order) return;
    setSaving(true);

    const calcSubtotal = order.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
    const calcRefundTotal = (order.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
    const calcTotal = calcSubtotal - calcRefundTotal - order.deposit_amount;
    const finalStaffName = editorName.trim() || order.staff_member_name || 'موظف مبيعات';

    const { error } = await supabase.from('orders').update({
      customer_name: order.customer_name,
      phone: order.phone,
      shop_name: order.shop_name,
      address: order.address,
      delivery_date: order.delivery_date,
      shipping_company: order.shipping_company,
      deposit_method: order.deposit_method,
      deposit_amount: order.deposit_amount,
      subtotal: calcSubtotal,
      total: calcTotal,
      staff_member_name: finalStaffName,
    }).eq('id', order.id);

    setSaving(false);
    if (error) {
      toast.error('فشل في حفظ التعديلات');
    } else {
      toast.success('تم حفظ تعديلات الطلب بنجاح');
      loadOrder();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <p className="text-muted-foreground text-lg animate-pulse">جاري تحميل بيانات الطلب...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center space-y-4" dir="rtl">
        <ShoppingCart className="h-16 w-16 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-bold">لم يتم العثور على الطلب</h2>
        <p className="text-muted-foreground text-sm">تأكد من صحة كود QR أو الرمز الممسوح</p>
        <Button onClick={() => navigate('/')} variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" /> العودة للرئيسية
        </Button>
      </div>
    );
  }

  const calcSubtotal = order.items?.reduce((sum, item) => sum + calculateItemTotal(item), 0) || 0;
  const calcRefundTotal = (order.refunds || []).reduce((sum, r) => sum + calculateItemTotal(r as unknown as OrderItem), 0);
  const calcTotal = calcSubtotal - calcRefundTotal - order.deposit_amount;

  return (
    <div className="min-h-screen bg-gradient-to-b from-baby-blue-light/50 via-background to-baby-pink-light/30 p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Top Header Card */}
        <div className="bg-card rounded-2xl p-6 border-2 border-primary/20 shadow-baby flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src={logoImage} alt="Babyland Logo" className="w-14 h-14 rounded-full shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold gradient-text">تعديل طلب رقم #{order.order_number}</h1>
                <Badge className="bg-primary text-primary-foreground font-bold">تعديل سريع</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">تعديل تفاصيل الطلب والمبيعات للموظفين فقط</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/')} size="sm" className="gap-2 rounded-xl">
            <ArrowRight className="h-4 w-4" /> الرئيسية
          </Button>
        </div>

        {/* Staff Editor Name Box */}
        <Card className="border-2 border-purple-500/20 bg-purple-50/30 dark:bg-purple-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <User className="h-5 w-5 text-purple-600" />
            <div className="flex-1">
              <label className="text-xs font-bold text-purple-900 dark:text-purple-300">اسم الموظف القائم بالتعديل:</label>
              <Input
                value={editorName}
                onChange={(e) => setEditorName(e.target.value)}
                placeholder="أدخل اسمك كـ موظف مبيعات"
                className="mt-1 bg-white dark:bg-background"
              />
            </div>
          </CardContent>
        </Card>

        {/* Customer Information Card */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              بيانات العميل والشحن
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">اسم العميل *</label>
                <Input
                  value={order.customer_name}
                  onChange={(e) => setOrder({ ...order, customer_name: e.target.value })}
                  placeholder="اسم العميل"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">رقم الهاتف *</label>
                <Input
                  value={order.phone}
                  onChange={(e) => setOrder({ ...order, phone: e.target.value })}
                  placeholder="رقم الهاتف"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">اسم المحل</label>
                <Input
                  value={order.shop_name || ''}
                  onChange={(e) => setOrder({ ...order, shop_name: e.target.value })}
                  placeholder="اسم المحل"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">العنوان التفصيلي</label>
                <Input
                  value={order.address || ''}
                  onChange={(e) => setOrder({ ...order, address: e.target.value })}
                  placeholder="العنوان والمحافظة"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">تاريخ التسليم</label>
                <Input
                  type="date"
                  value={order.delivery_date || ''}
                  onChange={(e) => setOrder({ ...order, delivery_date: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">شركة الشحن</label>
                <Input
                  value={order.shipping_company || ''}
                  onChange={(e) => setOrder({ ...order, shipping_company: e.target.value })}
                  placeholder="اسم شركة التوصيل"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deposit Information Card */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              معلومات العربون والدفع المقدم
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">طريقة الدفع</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={order.deposit_method || ''}
                  onChange={(e) => setOrder({ ...order, deposit_method: e.target.value || null })}
                >
                  <option value="">بدون عربون</option>
                  <option value="cash">كاش</option>
                  <option value="instapay">انستاباي</option>
                  <option value="vodafone_cash">فودافون كاش</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">قيمة العربون المدفوع</label>
                <Input
                  type="number"
                  min="0"
                  value={order.deposit_amount}
                  onChange={(e) => setOrder({ ...order, deposit_amount: parseFloat(e.target.value) || 0 })}
                  dir="ltr"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Section */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              المنتجات المطلوبة
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="أدخل كود المنتج لإضافته..."
                value={addProductCode}
                onChange={(e) => setAddProductCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}
                dir="ltr"
              />
              <Button onClick={handleAddProduct} className="gap-2 bg-primary">
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </div>

            <div className="border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-right">المنتج</th>
                    <th className="p-3 text-right">السعر</th>
                    <th className="p-3 text-right">الكمية</th>
                    <th className="p-3 text-right">الإجمالي</th>
                    <th className="p-3 text-right">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item) => {
                      const itemTotal = calculateItemTotal(item);
                      return (
                        <tr key={item.id} className="border-t hover:bg-muted/20">
                          <td className="p-3">
                            <p className="font-bold">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">الكود: #{item.product_code}</p>
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
                          <td className="p-3 font-bold text-primary">{itemTotal.toFixed(2)} ج.م</td>
                          <td className="p-3">
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleRemoveItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد منتجات في هذا الطلب</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Refund Products Section */}
        <Card className="border border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3 border-b border-destructive/20">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <Undo2 className="h-5 w-5" />
              منتجات الاسترجاع
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="أدخل كود المنتج المراد استرجاعه..."
                value={addRefundCode}
                onChange={(e) => setAddRefundCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRefund())}
                dir="ltr"
              />
              <Button onClick={handleAddRefund} variant="destructive" className="gap-2">
                <Undo2 className="h-4 w-4" /> استرجاع
              </Button>
            </div>

            {order.refunds && order.refunds.length > 0 && (
              <div className="border rounded-xl overflow-x-auto bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3 text-right">المنتج</th>
                      <th className="p-3 text-right">السعر</th>
                      <th className="p-3 text-right">الكمية</th>
                      <th className="p-3 text-right">الإجمالي</th>
                      <th className="p-3 text-right">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.refunds.map((r) => {
                      const rt = calculateItemTotal(r as unknown as OrderItem);
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="p-3 font-medium">{r.product_name} (#{r.product_code})</td>
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
          </CardContent>
        </Card>

        {/* Order Totals & Save Actions */}
        <Card className="border-2 border-primary/30 shadow-baby-lg bg-card">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2 border-b pb-4 text-left">
              <p className="text-sm text-muted-foreground flex justify-between">
                <span>الإجمالي الفرعي:</span>
                <span className="font-bold">{calcSubtotal.toFixed(2)} ج.م</span>
              </p>
              {calcRefundTotal > 0 && (
                <p className="text-sm text-destructive flex justify-between">
                  <span>إجمالي الاسترجاع:</span>
                  <span className="font-bold">-{calcRefundTotal.toFixed(2)} ج.م</span>
                </p>
              )}
              {order.deposit_amount > 0 && (
                <p className="text-sm text-emerald-600 flex justify-between">
                  <span>العربون المدفوع:</span>
                  <span className="font-bold">-{order.deposit_amount.toFixed(2)} ج.م</span>
                </p>
              )}
              <p className="text-2xl font-black text-primary flex justify-between pt-2 border-t">
                <span>المطلوب نهائياً:</span>
                <span>{calcTotal.toFixed(2)} ج.م</span>
              </p>
            </div>

            <Button
              onClick={handleSaveChanges}
              disabled={saving}
              className="w-full py-7 text-xl font-bold rounded-2xl bg-gradient-to-l from-primary to-secondary shadow-pink btn-bounce"
            >
              <Save className="h-6 w-6 ml-2" />
              {saving ? 'جاري حفظ التعديلات...' : 'حفظ التعديلات نهائياً'}
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default QuickOrderEdit;
