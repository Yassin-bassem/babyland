import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  CalendarDays,
  Printer,
  Loader2,
  Hash,
  ArrowLeftRight,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { format } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { printInvoicesBatch, InvoiceOrder } from '@/lib/invoicePrintHelper';

const DailySales = () => {
  const { activeVersion } = useVersion();

  // Permission verification
  const auth = sessionStorage.getItem('babyland_admin');
  const isFullAdmin = auth === 'true';
  const staffStr = sessionStorage.getItem('babyland_staff');
  const hasDailySalesPermission = isFullAdmin || (() => {
    if (auth === 'staff' && staffStr) {
      try {
        const staff = JSON.parse(staffStr);
        return Array.isArray(staff?.permissions) && staff.permissions.includes('daily_sales');
      } catch (e) {
        return false;
      }
    }
    return false;
  })();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Range printing states
  const [fromOrder, setFromOrder] = useState<string>('');
  const [toOrder, setToOrder] = useState<string>('');
  const [onlyThisDay, setOnlyThisDay] = useState<boolean>(true);
  const [isPrintingAll, setIsPrintingAll] = useState<boolean>(false);
  const [isPrintingRange, setIsPrintingRange] = useState<boolean>(false);
  const [printingSingleId, setPrintingSingleId] = useState<string | null>(null);

  // Search filter for orders list
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (activeVersion && selectedDate) {
      loadDay(selectedDate);
    }
  }, [activeVersion, selectedDate]);

  const loadDay = async (date: Date) => {
    if (!activeVersion) return;
    setLoading(true);

    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('version_id', activeVersion.id)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('order_number', { ascending: false });

    if (error) {
      console.error('Failed to load daily sales:', error);
      toast.error('فشل في تحميل مبيعات اليوم');
      setOrders([]);
    } else {
      setOrders((data as unknown as InvoiceOrder[]) || []);
    }
    setLoading(false);
  };

  const dayTotal = orders.reduce((sum, o) => sum + (Number(o.total) || 0) + (Number(o.deposit_amount) || 0), 0);
  const dayLabel = selectedDate
    ? format(selectedDate, 'EEEE d MMMM yyyy', { locale: arEG })
    : '';

  // Order number boundaries for the day
  const minDayOrderNumber = useMemo(() => {
    if (orders.length === 0) return null;
    return Math.min(...orders.map(o => o.order_number));
  }, [orders]);

  const maxDayOrderNumber = useMemo(() => {
    if (orders.length === 0) return null;
    return Math.max(...orders.map(o => o.order_number));
  }, [orders]);

  // Range calculation
  const parsedFrom = fromOrder.trim() !== '' ? parseInt(fromOrder.trim(), 10) : NaN;
  const parsedTo = toOrder.trim() !== '' ? parseInt(toOrder.trim(), 10) : NaN;
  const hasValidRange = !isNaN(parsedFrom) && !isNaN(parsedTo) && parsedFrom > 0 && parsedTo > 0;
  const minRange = hasValidRange ? Math.min(parsedFrom, parsedTo) : null;
  const maxRange = hasValidRange ? Math.max(parsedFrom, parsedTo) : null;

  const matchingDayOrders = useMemo(() => {
    if (!hasValidRange || minRange === null || maxRange === null) return [];
    return orders.filter(o => o.order_number >= minRange && o.order_number <= maxRange);
  }, [orders, hasValidRange, minRange, maxRange]);

  // Filtered orders for the display list
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.trim().toLowerCase();
    return orders.filter(o =>
      String(o.order_number).includes(q) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
      (o.phone && o.phone.includes(q)) ||
      (o.shop_name && o.shop_name.toLowerCase().includes(q))
    );
  }, [orders, searchQuery]);

  // Action: Print all day invoices with one button
  const handlePrintAllDay = async () => {
    if (orders.length === 0) {
      toast.error('لا توجد فواتير للطباعة في هذا اليوم');
      return;
    }

    setIsPrintingAll(true);
    const toastId = toast.loading(`جاري تجهيز ${orders.length} فاتورة لليوم المحدد...`);
    try {
      const success = await printInvoicesBatch(orders);
      if (success) {
        toast.success(`تم إرسال ${orders.length} فاتورة للطباعة بنجاح`, { id: toastId });
      } else {
        toast.error('تعذر إرسال الفواتير للطباعة', { id: toastId });
      }
    } catch (err) {
      console.error('Error printing all invoices:', err);
      toast.error('حدث خطأ أثناء طباعة فواتير اليوم', { id: toastId });
    } finally {
      setIsPrintingAll(false);
    }
  };

  // Action: Print from order number to order number
  const handlePrintRange = async () => {
    if (!hasValidRange || minRange === null || maxRange === null) {
      toast.error('يرجى إدخال أرقام صحيحة لنطاق الطلبات');
      return;
    }

    setIsPrintingRange(true);
    const toastId = toast.loading(`جاري البحث وتجهيز الفواتير من #${minRange} إلى #${maxRange}...`);

    try {
      let ordersToPrint: InvoiceOrder[] = [];

      if (onlyThisDay) {
        ordersToPrint = matchingDayOrders;
      } else {
        // Query across all dates for the active version
        if (!activeVersion) return;
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('version_id', activeVersion.id)
          .gte('order_number', minRange)
          .lte('order_number', maxRange)
          .order('order_number', { ascending: true });

        if (error) throw error;
        ordersToPrint = (data as unknown as InvoiceOrder[]) || [];
      }

      if (ordersToPrint.length === 0) {
        toast.error(`لم يتم العثور على أي فواتير في النطاق من #${minRange} إلى #${maxRange}`, { id: toastId });
        return;
      }

      toast.loading(`جاري إرسال ${ordersToPrint.length} فاتورة للطباعة...`, { id: toastId });
      const success = await printInvoicesBatch(ordersToPrint);
      if (success) {
        toast.success(`تمت طباعة ${ordersToPrint.length} فاتورة بنجاح (من #${minRange} إلى #${maxRange})`, { id: toastId });
      } else {
        toast.error('تعذر إرسال الفواتير للطباعة', { id: toastId });
      }
    } catch (err) {
      console.error('Error printing range:', err);
      toast.error('حدث خطأ أثناء طباعة نطاق الفواتير', { id: toastId });
    } finally {
      setIsPrintingRange(false);
    }
  };

  // Action: Print single invoice from the list
  const handlePrintSingle = async (order: InvoiceOrder) => {
    setPrintingSingleId(order.id);
    const toastId = toast.loading(`جاري تجهيز فاتورة #${order.order_number}...`);
    try {
      const success = await printInvoicesBatch([order]);
      if (success) {
        toast.success(`تم إرسال فاتورة رقم #${order.order_number} للطباعة`, { id: toastId });
      } else {
        toast.error('فشل في إرسال الفاتورة للطباعة', { id: toastId });
      }
    } catch (err) {
      console.error('Error printing single invoice:', err);
      toast.error('حدث خطأ أثناء الطباعة', { id: toastId });
    } finally {
      setPrintingSingleId(null);
    }
  };

  // Quick fill helper for all day range
  const handleQuickFillAllDay = () => {
    if (minDayOrderNumber !== null && maxDayOrderNumber !== null) {
      setFromOrder(String(minDayOrderNumber));
      setToOrder(String(maxDayOrderNumber));
    }
  };

  const handleClearRange = () => {
    setFromOrder('');
    setToOrder('');
  };

  if (!hasDailySalesPermission) {
    return <div className="text-center py-12 text-muted-foreground">غير مصرح بالوصول</div>;
  }

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header and Date Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            المبيعات اليومية
          </h1>
          <p className="text-sm text-muted-foreground">
            إجمالي مبيعات اليوم المختار وإدارة طباعة الفواتير دفعة واحدة أو بنطاق محدد
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'min-w-[240px] justify-start text-left font-normal border-2',
                !selectedDate && 'text-muted-foreground'
              )}
            >
              <CalendarDays className="ml-2 h-4 w-4 text-primary" />
              {selectedDate ? dayLabel : 'اختر يوم'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          جاري تحميل بيانات اليوم...
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">إجمالي مبيعات اليوم</CardDescription>
                <CardTitle className="text-2xl font-black text-primary">
                  {dayTotal.toFixed(2)} ج.م
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">بدون خصم العربون</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">عدد طلبات اليوم</CardDescription>
                <CardTitle className="text-2xl font-black flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                  {orders.length} طلب
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {orders.length > 0 ? `تاريخ: ${dayLabel}` : 'لا توجد طلبات'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">نطاق أرقام الطلبات اليوم</CardDescription>
                <CardTitle className="text-xl font-bold flex items-center gap-1.5">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  {minDayOrderNumber !== null && maxDayOrderNumber !== null ? (
                    <span>
                      #{minDayOrderNumber} — #{maxDayOrderNumber}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm font-normal">لا توجد طلبات</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {orders.length > 0 ? `${orders.length} فاتورة مسجلة في هذا اليوم` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ========================================================================= */}
          {/* INVOICE PRINTING SECTION (طباعة جميع الفواتير / طباعة بنطاق محدد) */}
          {/* ========================================================================= */}
          <Card className="border-2 border-primary/30 shadow-sm bg-card">
            <CardHeader className="pb-4 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Printer className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">خيارات طباعة الفواتير</CardTitle>
                    <CardDescription className="text-xs">
                      اطبع جميع فواتير اليوم بضغطة زر واحدة أو حدد نطاق أرقام الفواتير المطلوبة
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit text-xs font-semibold px-2.5 py-1">
                  {orders.length} فاتورة متاحة اليوم
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Print All Today's Invoices Block */}
                <div className="flex flex-col justify-between p-5 rounded-xl border-2 border-primary/20 bg-primary/5 hover:border-primary/40 transition-all space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-primary" />
                      <h3 className="font-bold text-base text-foreground">
                        طباعة جميع فواتير اليوم بالكامل
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      ضغطة زر واحدة لتجهيز وطباعة كافة فواتير اليوم ({orders.length} فاتورة) تلقائياً،
                      مرتبة تصاعدياً برقم الطلب لتسهيل تسليمها ومراجعتها.
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    className="w-full font-bold gap-2 text-base shadow-sm"
                    disabled={orders.length === 0 || isPrintingAll || isPrintingRange}
                    onClick={handlePrintAllDay}
                  >
                    {isPrintingAll ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin ml-1" />
                        جاري تجهيز ({orders.length}) فاتورة...
                      </>
                    ) : (
                      <>
                        <Printer className="h-5 w-5 ml-1" />
                        طباعة جميع فواتير اليوم ({orders.length} فاتورة)
                      </>
                    )}
                  </Button>
                </div>

                {/* 2. Print From Order Number to Order Number Block */}
                <div className="flex flex-col justify-between p-5 rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-muted/20 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                        <h3 className="font-bold text-base text-foreground">
                          طباعة نطاق مخصص (من رقم طلب إلى رقم طلب)
                        </h3>
                      </div>
                      {(fromOrder || toOrder) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
                          onClick={handleClearRange}
                        >
                          <RotateCcw className="h-3 w-3" />
                          مسح
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      حدد رقم بداية ورقم نهاية لطباعة حزمة محددة من الفواتير (مثال: من رقم 50 إلى 75).
                    </p>

                    {/* Inputs Row */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="from-order-input" className="text-xs font-semibold text-muted-foreground">
                          من رقم طلب:
                        </Label>
                        <div className="relative">
                          <Input
                            id="from-order-input"
                            type="number"
                            min={1}
                            placeholder={minDayOrderNumber !== null ? String(minDayOrderNumber) : 'من رقم'}
                            value={fromOrder}
                            onChange={(e) => setFromOrder(e.target.value)}
                            className="font-bold text-center border-slate-300 dark:border-slate-700 h-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="to-order-input" className="text-xs font-semibold text-muted-foreground">
                          إلى رقم طلب:
                        </Label>
                        <div className="relative">
                          <Input
                            id="to-order-input"
                            type="number"
                            min={1}
                            placeholder={maxDayOrderNumber !== null ? String(maxDayOrderNumber) : 'إلى رقم'}
                            value={toOrder}
                            onChange={(e) => setToOrder(e.target.value)}
                            className="font-bold text-center border-slate-300 dark:border-slate-700 h-10"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick fill & info row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {minDayOrderNumber !== null && maxDayOrderNumber !== null && (
                        <button
                          type="button"
                          onClick={handleQuickFillAllDay}
                          className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          تعبئة نطاق اليوم (#{minDayOrderNumber} إلى #{maxDayOrderNumber})
                        </button>
                      )}

                      <div className="flex items-center gap-2 mr-auto">
                        <Checkbox
                          id="only-today-checkbox"
                          checked={onlyThisDay}
                          onCheckedChange={(checked) => setOnlyThisDay(Boolean(checked))}
                        />
                        <Label htmlFor="only-today-checkbox" className="text-xs text-muted-foreground cursor-pointer">
                          فقط من طلبات هذا اليوم
                        </Label>
                      </div>
                    </div>

                    {/* Range Feedback Badge */}
                    {hasValidRange && (
                      <div className="pt-1">
                        {onlyThisDay ? (
                          matchingDayOrders.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded-lg font-medium border border-emerald-500/20">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span>
                                تم العثور على <strong>{matchingDayOrders.length}</strong> فاتورة في هذا اليوم (من #{minRange} إلى #{maxRange})
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-2 rounded-lg font-medium border border-amber-500/20">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              <span>
                                لا توجد فواتير مسجلة في هذا اليوم ضمن النطاق #{minRange} إلى #{maxRange} (يمكنك إلغاء تحديد "فقط من طلبات هذا اليوم" للبحث في النظام بالكامل)
                              </span>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 bg-blue-500/10 p-2 rounded-lg font-medium border border-blue-500/20">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>
                              سيتم البحث في قاعدة البيانات عن جميع الطلبات من #{minRange} إلى #{maxRange}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="w-full font-bold gap-2 text-base border-2 hover:bg-muted"
                    disabled={
                      !hasValidRange ||
                      isPrintingAll ||
                      isPrintingRange ||
                      (onlyThisDay && matchingDayOrders.length === 0)
                    }
                    onClick={handlePrintRange}
                  >
                    {isPrintingRange ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin ml-1" />
                        جاري تجهيز النطاق المحدد...
                      </>
                    ) : (
                      <>
                        <Printer className="h-5 w-5 ml-1" />
                        طباعة النطاق المحدد
                        {hasValidRange && onlyThisDay && matchingDayOrders.length > 0 && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                            {matchingDayOrders.length} فاتورة
                          </span>
                        )}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ========================================================================= */}
          {/* ORDERS LIST (قائمة فواتير اليوم مع إمكانية طباعة أي فاتورة منفردة) */}
          {/* ========================================================================= */}
          <Card className="border-2 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <span>فواتير اليوم ({orders.length})</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    قائمة طلبات {dayLabel} — يمكنك طباعة أي فاتورة فردية بالضغط على أيقونة الطباعة
                  </CardDescription>
                </div>

                {orders.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث برقم الطلب، العميل..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-9 h-9 text-xs"
                    />
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {orders.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 space-y-2">
                  <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p>لا توجد مبيعات مسجلة في هذا اليوم</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center text-muted-foreground py-10">
                  لا توجد نتائج تطابق بحثك
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((o) => {
                    const isRowInRange = hasValidRange && minRange !== null && maxRange !== null
                      ? o.order_number >= minRange && o.order_number <= maxRange
                      : false;

                    const totalWithDeposit = Number(o.total || 0) + Number(o.deposit_amount || 0);

                    return (
                      <div
                        key={o.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-all text-sm',
                          isRowInRange
                            ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                            : 'bg-muted/30 border-transparent hover:bg-muted/60'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-primary text-base min-w-[50px]">
                            #{o.order_number}
                          </span>
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              <span>{o.customer_name}</span>
                              {o.shop_name && (
                                <Badge variant="outline" className="text-[10px] font-normal py-0">
                                  {o.shop_name}
                                </Badge>
                              )}
                              {o.branch && (
                                <Badge variant="secondary" className="text-[10px] font-normal py-0">
                                  فرع {o.branch}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              {o.phone && <span>{o.phone}</span>}
                              {o.created_at && (
                                <span>• {new Date(o.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-left">
                            <span className="font-bold text-foreground">
                              {totalWithDeposit.toFixed(2)} ج.م
                            </span>
                            {Number(o.deposit_amount) > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                عربون: {Number(o.deposit_amount).toFixed(2)} ج.م
                              </div>
                            )}
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 border-slate-300 dark:border-slate-700 hover:text-primary hover:border-primary"
                            disabled={printingSingleId === o.id || isPrintingAll || isPrintingRange}
                            onClick={() => handlePrintSingle(o)}
                            title={`طباعة فاتورة #${o.order_number}`}
                          >
                            {printingSingleId === o.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default DailySales;
