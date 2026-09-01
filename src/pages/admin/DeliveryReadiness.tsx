import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileSpreadsheet, 
  Upload, 
  Search, 
  RefreshCw, 
  Truck, 
  ChevronDown, 
  ChevronUp, 
  PackageCheck,
  PackageX,
  Building2,
  Phone,
  Calendar,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderItem {
  id: string;
  order_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string | null;
  shop_name: string | null;
  phone: string | null;
  created_at: string;
  status: string;
  total: number;
}

interface AnalyzedOrder extends Order {
  items: OrderItem[];
  availableItems: OrderItem[];
  missingItems: OrderItem[];
  totalItemsCount: number;
  availableItemsCount: number;
  missingItemsCount: number;
  missingDistinctCodesCount: number;
  readinessPercentage: number;
  category: 'fully_ready' | 'missing_1_5' | 'missing_gt_5';
}

const DeliveryReadiness: React.FC = () => {
  const { activeVersion } = useVersion();
  const currentVersionId = activeVersion?.id;
  const { toast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [readyCodesMap, setReadyCodesMap] = useState<Map<string, { name: string; price?: number }>>(new Map());
  const [readyFileName, setReadyFileName] = useState<string>('جاهز للتسليم.xlsx');

  const [activeTab, setActiveTab] = useState<'all' | 'fully_ready' | 'missing_1_5' | 'missing_gt_5'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Load ready codes from default excel file in public/ or state
  useEffect(() => {
    loadDefaultExcel();
  }, []);

  // Load orders and items from DB whenever active version changes
  useEffect(() => {
    if (currentVersionId) {
      loadData();
    }
  }, [currentVersionId]);

  const loadDefaultExcel = async () => {
    try {
      const response = await fetch('/جاهز%20للتسليم.xlsx');
      if (!response.ok) {
        throw new Error('Default file not found');
      }
      const arrayBuffer = await response.arrayBuffer();
      parseExcelBuffer(arrayBuffer, 'جاهز للتسليم.xlsx');
    } catch (err) {
      console.warn('Could not load default جاهز للتسليم.xlsx from public:', err);
    }
  };

  const parseExcelBuffer = (buffer: ArrayBuffer, fileName: string) => {
    try {
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);

      const codesMap = new Map<string, { name: string; price?: number }>();
      for (const r of rows) {
        const rawCode = r['الكود '] || r['الكود'] || r['كود'] || r['code'] || r['Code'];
        if (rawCode !== undefined && rawCode !== null) {
          const codeStr = String(rawCode).trim();
          const name = r['الصنف '] || r['الصنف'] || r['اسم الصنف'] || '';
          const price = Number(r['السعر']) || 0;
          codesMap.set(codeStr, { name, price });
        }
      }

      setReadyCodesMap(codesMap);
      setReadyFileName(fileName);
      toast({
        title: 'تم تحميل ملف الأكواد الجاهزة ✅',
        description: `تم قراءة ${codesMap.size} كود من ملف ${fileName}`,
      });
    } catch (error) {
      console.error('Error parsing excel:', error);
      toast({
        title: 'خطأ في قراءة ملف Excel',
        description: 'يرجى التأكد من أن الملف بصيغة .xlsx صحيح',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const buffer = evt.target?.result as ArrayBuffer;
      if (buffer) {
        parseExcelBuffer(buffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const loadData = async () => {
    if (!currentVersionId) return;
    setLoading(true);

    try {
      // 1. Fetch Orders
      let allFetchedOrders: Order[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, shop_name, phone, created_at, status, total')
          .eq('version_id', currentVersionId)
          .order('order_number', { ascending: true })
          .range(page * 1000, (page + 1) * 1000 - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allFetchedOrders = allFetchedOrders.concat(data as Order[]);
        if (data.length < 1000) break;
        page++;
      }

      // 2. Fetch Order Items
      let allFetchedItems: OrderItem[] = [];
      page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('order_items')
          .select('id, order_id, product_code, product_name, quantity, price')
          .eq('version_id', currentVersionId)
          .range(page * 1000, (page + 1) * 1000 - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allFetchedItems = allFetchedItems.concat(data as OrderItem[]);
        if (data.length < 1000) break;
        page++;
      }

      setOrders(allFetchedOrders);
      setOrderItems(allFetchedItems);
    } catch (err) {
      console.error('Error fetching delivery data:', err);
      toast({
        title: 'حدث خطأ أثناء جلب الطلبات',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Analyze readiness for all fetched orders
  const analyzedOrders: AnalyzedOrder[] = useMemo(() => {
    const itemsMap = new Map<string, OrderItem[]>();
    for (const item of orderItems) {
      if (!itemsMap.has(item.order_id)) {
        itemsMap.set(item.order_id, []);
      }
      itemsMap.get(item.order_id)!.push(item);
    }

    return orders.map((order) => {
      const items = itemsMap.get(order.id) || [];
      const availableItems: OrderItem[] = [];
      const missingItems: OrderItem[] = [];
      const missingCodesSet = new Set<string>();

      for (const item of items) {
        const code = String(item.product_code || '').trim();
        if (readyCodesMap.has(code)) {
          availableItems.push(item);
        } else {
          missingItems.push(item);
          missingCodesSet.add(code);
        }
      }

      const totalItemsCount = items.length;
      const availableItemsCount = availableItems.length;
      const missingItemsCount = missingItems.length;
      const missingDistinctCodesCount = missingCodesSet.size;

      const readinessPercentage = totalItemsCount > 0 
        ? Math.round((availableItemsCount / totalItemsCount) * 100) 
        : 100;

      let category: 'fully_ready' | 'missing_1_5' | 'missing_gt_5';
      if (missingDistinctCodesCount === 0) {
        category = 'fully_ready';
      } else if (missingDistinctCodesCount >= 1 && missingDistinctCodesCount <= 5) {
        category = 'missing_1_5';
      } else {
        category = 'missing_gt_5';
      }

      return {
        ...order,
        items,
        availableItems,
        missingItems,
        totalItemsCount,
        availableItemsCount,
        missingItemsCount,
        missingDistinctCodesCount,
        readinessPercentage,
        category,
      };
    });
  }, [orders, orderItems, readyCodesMap]);

  // Statistics counts
  const stats = useMemo(() => {
    const total = analyzedOrders.length;
    const fullyReady = analyzedOrders.filter(o => o.category === 'fully_ready').length;
    const missing1to5 = analyzedOrders.filter(o => o.category === 'missing_1_5').length;
    const missingGt5 = analyzedOrders.filter(o => o.category === 'missing_gt_5').length;

    return { total, fullyReady, missing1to5, missingGt5 };
  }, [analyzedOrders]);

  // Filtered orders according to activeTab and searchTerm
  const filteredOrders = useMemo(() => {
    return analyzedOrders.filter((o) => {
      // Tab filter
      if (activeTab === 'fully_ready' && o.category !== 'fully_ready') return false;
      if (activeTab === 'missing_1_5' && o.category !== 'missing_1_5') return false;
      if (activeTab === 'missing_gt_5' && o.category !== 'missing_gt_5') return false;

      // Search filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();

      const orderNumStr = String(o.order_number || '');
      const custName = (o.customer_name || '').toLowerCase();
      const shopName = (o.shop_name || '').toLowerCase();
      const phone = (o.phone || '').toLowerCase();
      
      const matchesOrderInfo = orderNumStr.includes(term) || custName.includes(term) || shopName.includes(term) || phone.includes(term);
      if (matchesOrderInfo) return true;

      // Check if any missing or available item code matches
      const matchesItemCode = o.items.some(i => (i.product_code || '').toLowerCase().includes(term) || (i.product_name || '').toLowerCase().includes(term));
      return matchesItemCode;
    });
  }, [analyzedOrders, activeTab, searchTerm]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedOrders);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedOrders(next);
  };

  const expandAll = () => {
    setExpandedOrders(new Set(filteredOrders.map(o => o.id)));
  };

  const collapseAll = () => {
    setExpandedOrders(new Set());
  };

  // Export comprehensive report to Excel
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = [
        ['تقرير جاهزية التسليم - ' + (activeVersion?.name || '')],
        ['تاريخ التقرير', new Date().toLocaleDateString('ar-EG')],
        ['ملف الأكواد الجاهزة المستعمل', readyFileName],
        ['عدد الأكواد الجاهزة بالملف', readyCodesMap.size],
        [''],
        ['التصنيف', 'عدد الطلبات', 'النسبة المئوية'],
        ['جاهز بالكامل (0 أصناف ناقصة)', stats.fullyReady, `${((stats.fullyReady / (stats.total || 1)) * 100).toFixed(1)}%`],
        ['ناقص من 1 إلى 5 أصناف', stats.missing1to5, `${((stats.missing1to5 / (stats.total || 1)) * 100).toFixed(1)}%`],
        ['ناقص أكثر من 5 أصناف', stats.missingGt5, `${((stats.missingGt5 / (stats.total || 1)) * 100).toFixed(1)}%`],
        ['إجمالي الطلبات', stats.total, '100%'],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');

      // Helper to generate order list rows
      const generateOrderRows = (orderList: AnalyzedOrder[]) => {
        const rows: (string | number)[][] = [
          ['رقم الطلب', 'اسم العميل', 'اسم المحل', 'رقم الهاتف', 'إجمالي الأصناف', 'الأصناف المتوفرة', 'الأصناف الناقصة', 'أكواد الأصناف الناقصة', 'تاريخ الطلب'],
        ];
        for (const o of orderList) {
          const missingCodesStr = o.missingItems.map(i => `${i.product_code} (${i.product_name || ''})`).join(' ، ');
          rows.push([
            o.order_number,
            o.customer_name || 'بدون اسم',
            o.shop_name || 'بدون محل',
            o.phone || '',
            o.totalItemsCount,
            o.availableItemsCount,
            o.missingDistinctCodesCount,
            missingCodesStr || 'لا يوجد (متوفر بالكامل)',
            new Date(o.created_at).toLocaleDateString('ar-EG'),
          ]);
        }
        return XLSX.utils.aoa_to_sheet(rows);
      };

      // Sheet 2: Fully Ready
      const fullyReadyOrders = analyzedOrders.filter(o => o.category === 'fully_ready');
      const wsFully = generateOrderRows(fullyReadyOrders);
      XLSX.utils.book_append_sheet(wb, wsFully, 'جاهز بالكامل');

      // Sheet 3: Missing 1-5
      const missing1to5Orders = analyzedOrders.filter(o => o.category === 'missing_1_5');
      const ws1to5 = generateOrderRows(missing1to5Orders);
      XLSX.utils.book_append_sheet(wb, ws1to5, 'ناقص 1-5 أصناف');

      // Sheet 4: Missing > 5
      const missingGt5Orders = analyzedOrders.filter(o => o.category === 'missing_gt_5');
      const wsGt5 = generateOrderRows(missingGt5Orders);
      XLSX.utils.book_append_sheet(wb, wsGt5, 'ناقص أكثر من 5 أصناف');

      // Sheet 5: Itemized Missing Products
      const itemizedRows: (string | number)[][] = [
        ['رقم الطلب', 'اسم العميل', 'اسم المحل', 'كود الصنف الناقص', 'اسم الصنف الناقص', 'الكمية المطلوبة'],
      ];
      for (const o of analyzedOrders) {
        for (const mi of o.missingItems) {
          itemizedRows.push([
            o.order_number,
            o.customer_name || '',
            o.shop_name || '',
            mi.product_code,
            mi.product_name || '',
            mi.quantity,
          ]);
        }
      }
      const wsItemized = XLSX.utils.aoa_to_sheet(itemizedRows);
      XLSX.utils.book_append_sheet(wb, wsItemized, 'تفاصيل الأصناف الناقصة');

      XLSX.writeFile(wb, `تقرير_جاهزية_التسليم_${activeVersion?.name || '2027'}_${new Date().toLocaleDateString('ar-EG')}.xlsx`);
      toast({
        title: 'تم تصدير ملف Excel بنجاح ✅',
      });
    } catch (err) {
      console.error('Export excel error:', err);
      toast({
        title: 'حدث خطأ أثناء تصدير Excel',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">جاهزية التسليم</h1>
            <Badge variant="outline" className="mr-2 font-mono">
              {activeVersion?.name || 'النسخة الحالية'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            فحص توفر أصناف الطلبات بناءً على الأكواد المجهزة في ملف (<span className="font-semibold text-foreground">{readyFileName}</span>)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                رفع ملف Excel جديد
              </span>
            </Button>
          </label>

          <Button onClick={exportToExcel} variant="default" size="sm" className="gap-2" disabled={loading || stats.total === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            تصدير تقرير Excel
          </Button>

          <Button onClick={loadData} variant="ghost" size="icon" title="تحديث البيانات">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <Card 
          className={`cursor-pointer transition-all ${activeTab === 'all' ? 'ring-2 ring-primary bg-primary/5' : 'hover:border-primary/50'}`}
          onClick={() => setActiveTab('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">إجمالي الطلبات</CardTitle>
            <Layers className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">جميع طلبات النسخة النشطة</p>
          </CardContent>
        </Card>

        {/* Fully Ready */}
        <Card 
          className={`cursor-pointer transition-all border-emerald-500/30 ${activeTab === 'fully_ready' ? 'ring-2 ring-emerald-500 bg-emerald-500/10' : 'hover:border-emerald-500'}`}
          onClick={() => setActiveTab('fully_ready')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">جاهز بالكامل</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {stats.fullyReady}
            </div>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
              0 أصناف ناقصة ({stats.total > 0 ? Math.round((stats.fullyReady / stats.total) * 100) : 0}%)
            </p>
          </CardContent>
        </Card>

        {/* Missing 1 to 5 */}
        <Card 
          className={`cursor-pointer transition-all border-amber-500/30 ${activeTab === 'missing_1_5' ? 'ring-2 ring-amber-500 bg-amber-500/10' : 'hover:border-amber-500'}`}
          onClick={() => setActiveTab('missing_1_5')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">ناقص من 1 إلى 5 أصناف</CardTitle>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {stats.missing1to5}
            </div>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
              ينقصه 1-5 كود ({stats.total > 0 ? Math.round((stats.missing1to5 / stats.total) * 100) : 0}%)
            </p>
          </CardContent>
        </Card>

        {/* Missing > 5 */}
        <Card 
          className={`cursor-pointer transition-all border-rose-500/30 ${activeTab === 'missing_gt_5' ? 'ring-2 ring-rose-500 bg-rose-500/10' : 'hover:border-rose-500'}`}
          onClick={() => setActiveTab('missing_gt_5')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-rose-600 dark:text-rose-400">ناقص أكثر من 5 أصناف</CardTitle>
            <XCircle className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-rose-600 dark:text-rose-400">
              {stats.missingGt5}
            </div>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
              ينقصه 6+ أصناف ({stats.total > 0 ? Math.round((stats.missingGt5 / stats.total) * 100) : 0}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم العميل، المحل، الهاتف، رقم الأوردر، أو كود الصنف الناقص..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Expand / Collapse buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={expandAll}>
                <ChevronDown className="h-4 w-4 ml-1" />
                توسيع الكل
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                <ChevronUp className="h-4 w-4 ml-1" />
                طي الكل
              </Button>
            </div>
          </div>

          {/* Active Tab indicator description */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <span>
              عرض {filteredOrders.length} من إجمالي {stats.total} أوردر
            </span>
            <span>
              الأكواد المتوفرة في الملف الحالية: <strong className="text-foreground">{readyCodesMap.size} كود</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      {loading ? (
        <Card className="p-12 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
          <p className="text-muted-foreground">جاري فحص وتصفية جاهزية التسليم...</p>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-12 text-center">
          <PackageX className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
          <h3 className="font-bold text-lg">لا توجد طلبات مطابقة</h3>
          <p className="text-sm text-muted-foreground mt-1">جرّب تغيير كلمة البحث أو اختيار تصنيف آخر من الأعلى</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => {
            const isExpanded = expandedOrders.has(o.id);

            return (
              <Card 
                key={o.id}
                className={`transition-all border-l-4 ${
                  o.category === 'fully_ready' 
                    ? 'border-l-emerald-500 hover:shadow-md' 
                    : o.category === 'missing_1_5' 
                    ? 'border-l-amber-500 hover:shadow-md' 
                    : 'border-l-rose-500 hover:shadow-md'
                }`}
              >
                <div 
                  className="p-4 cursor-pointer select-none"
                  onClick={() => toggleExpand(o.id)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Customer & Order info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="font-mono font-bold text-sm">
                          #{o.order_number}
                        </Badge>

                        <span className="font-bold text-base">
                          {o.customer_name || 'عميل غير مسجل'}
                        </span>

                        {o.shop_name && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded">
                            <Building2 className="h-3 w-3" />
                            {o.shop_name}
                          </span>
                        )}

                        {o.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono bg-muted/60 px-2 py-0.5 rounded">
                            <Phone className="h-3 w-3" />
                            {o.phone}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(o.created_at).toLocaleDateString('ar-EG')}
                        </span>
                        <span>•</span>
                        <span>إجمالي الأصناف: <strong className="text-foreground font-mono">{o.totalItemsCount}</strong></span>
                        <span>•</span>
                        <span>المتوفر: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{o.availableItemsCount}</strong></span>
                        <span>•</span>
                        <span>الناقص: <strong className="text-rose-600 dark:text-rose-400 font-mono">{o.missingDistinctCodesCount} صنف</strong></span>
                      </div>
                    </div>

                    {/* Status badge & Progress bar */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="w-32 hidden sm:block">
                        <div className="flex justify-between text-xs mb-1 font-mono">
                          <span className="text-muted-foreground">الجاهزية</span>
                          <span className="font-bold">{o.readinessPercentage}%</span>
                        </div>
                        <Progress 
                          value={o.readinessPercentage} 
                          className={`h-2 ${
                            o.category === 'fully_ready' 
                              ? '[&>div]:bg-emerald-500' 
                              : o.category === 'missing_1_5' 
                              ? '[&>div]:bg-amber-500' 
                              : '[&>div]:bg-rose-500'
                          }`}
                        />
                      </div>

                      {o.category === 'fully_ready' ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 py-1 px-3">
                          <CheckCircle2 className="h-4 w-4" />
                          جاهز بالكامل
                        </Badge>
                      ) : o.category === 'missing_1_5' ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1 py-1 px-3">
                          <AlertTriangle className="h-4 w-4" />
                          ناقص {o.missingDistinctCodesCount} أصناف
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500 hover:bg-rose-600 text-white gap-1 py-1 px-3">
                          <XCircle className="h-4 w-4" />
                          ناقص {o.missingDistinctCodesCount} أصناف
                        </Badge>
                      )}

                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 p-4 space-y-4 rounded-b-xl">
                    {/* Missing items list */}
                    {o.missingItems.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 mb-2">
                          <PackageX className="h-4 w-4" />
                          الأصناف الناقصة غير المتوفرة بملف التسليم ({o.missingDistinctCodesCount} صنف):
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {o.missingItems.map((item) => (
                            <div 
                              key={item.id}
                              className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-xs text-rose-700 dark:text-rose-300 block">
                                  كود: {item.product_code}
                                </span>
                                <span className="text-xs text-foreground font-medium line-clamp-1">
                                  {item.product_name}
                                </span>
                              </div>
                              <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 font-mono text-xs shrink-0">
                                كمية: {item.quantity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Available items list */}
                    {o.availableItems.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-2">
                          <PackageCheck className="h-4 w-4" />
                          الأصناف المتوفرة بملف التسليم ({o.availableItems.length} صنف):
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {o.availableItems.map((item) => (
                            <div 
                              key={item.id}
                              className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-start justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300 block">
                                  كود: {item.product_code}
                                </span>
                                <span className="text-xs text-foreground font-medium line-clamp-1">
                                  {item.product_name}
                                </span>
                              </div>
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-xs shrink-0">
                                كمية: {item.quantity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveryReadiness;
