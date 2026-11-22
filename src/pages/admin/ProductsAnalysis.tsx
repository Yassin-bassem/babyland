import { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  CalendarDays,
  Filter,
  Download,
  Search,
  AlertCircle,
  CheckCircle2,
  Flame,
  Snowflake,
  ArrowUpDown,
  Eye,
  BarChart2,
  PieChart,
  Sparkles,
  Layers,
  DollarSign,
  Clock,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ProductImage from '@/components/ProductImage';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell
} from 'recharts';

export interface ProductAnalysisItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  image_url: string | null;
  multiplier: number;

  // Sales metrics in period
  ordersCount: number;
  packagesSold: number;
  piecesSold: number;
  grossRevenue: number;
  refundsPieces: number;
  refundRevenue: number;
  netPiecesSold: number;
  netRevenue: number;

  status: 'top' | 'medium' | 'low' | 'zero';
}

interface SaleOrderDetail {
  order_id: string;
  order_number: number;
  customer_name: string;
  phone: string;
  quantity: number;
  pieces: number;
  price: number;
  total: number;
  created_at: string;
}

type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'allTime'
  | 'singleDay'
  | 'custom';

// Helper to get description multiplier (e.g., "250/10" => 10)
const getDescriptionMultiplier = (description: string | null | undefined): number => {
  if (!description) return 1;
  const match = description.match(/(\d+)\/(\d+)/);
  if (match) return parseInt(match[2], 10);
  const endMatch = description.match(/\/(\d+)$/);
  if (endMatch) return parseInt(endMatch[1], 10);
  return 1;
};

const ProductsAnalysis = () => {
  const { activeVersion } = useVersion();

  // Permission check
  const auth = sessionStorage.getItem('babyland_admin');
  const isFullAdmin = auth === 'true';
  const staffStr = sessionStorage.getItem('babyland_staff');
  const hasPermission = isFullAdmin || (() => {
    if (auth === 'staff' && staffStr) {
      try {
        const staff = JSON.parse(staffStr);
        return Array.isArray(staff?.permissions) && staff.permissions.includes('products_analysis');
      } catch (e) {
        return false;
      }
    }
    return false;
  })();

  // Period filter states
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('today');
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [customStartDate, setCustomStartDate] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Data states
  const [loading, setLoading] = useState(true);
  const [productsAnalysis, setProductsAnalysis] = useState<ProductAnalysisItem[]>([]);
  const [rawOrderItems, setRawOrderItems] = useState<any[]>([]);
  const [ordersMap, setOrdersMap] = useState<Map<string, any>>(new Map());

  // Table filtering and sorting
  const [statusFilter, setStatusFilter] = useState<'all' | 'top' | 'medium' | 'low' | 'zero'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>('pieces_desc');

  // Product details dialog
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysisItem | null>(null);
  const [productOrderDetails, setProductOrderDetails] = useState<SaleOrderDetail[]>([]);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Compute active date boundaries
  const { startDate, endDate, periodLabel } = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    let label = '';

    switch (periodPreset) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        label = `اليوم (${format(now, 'EEEE d MMMM yyyy', { locale: arEG })})`;
        break;
      case 'yesterday': {
        const yest = subDays(now, 1);
        start = startOfDay(yest);
        end = endOfDay(yest);
        label = `أمس (${format(yest, 'EEEE d MMMM yyyy', { locale: arEG })})`;
        break;
      }
      case 'last7':
        start = startOfDay(subDays(now, 6));
        end = endOfDay(now);
        label = `آخر 7 أيام (من ${format(start, 'dd/MM')} إلى ${format(end, 'dd/MM/yyyy')})`;
        break;
      case 'last30':
        start = startOfDay(subDays(now, 29));
        end = endOfDay(now);
        label = `آخر 30 يوماً (من ${format(start, 'dd/MM')} إلى ${format(end, 'dd/MM/yyyy')})`;
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfDay(now);
        label = `هذا الشهر (${format(now, 'MMMM yyyy', { locale: arEG })})`;
        break;
      case 'lastMonth': {
        const prevMonth = subMonths(now, 1);
        start = startOfMonth(prevMonth);
        end = endOfMonth(prevMonth);
        label = `الشهر السابق (${format(prevMonth, 'MMMM yyyy', { locale: arEG })})`;
        break;
      }
      case 'singleDay':
        if (selectedDay) {
          start = startOfDay(selectedDay);
          end = endOfDay(selectedDay);
          label = `يوم ${format(selectedDay, 'EEEE d MMMM yyyy', { locale: arEG })}`;
        } else {
          start = startOfDay(now);
          end = endOfDay(now);
          label = 'اليوم';
        }
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          const s = new Date(customStartDate + 'T00:00:00');
          const e = new Date(customEndDate + 'T23:59:59.999');
          start = isNaN(s.getTime()) ? startOfDay(now) : s;
          end = isNaN(e.getTime()) ? endOfDay(now) : e;
          label = `فترة مخصصة (من ${format(start, 'dd/MM/yyyy')} إلى ${format(end, 'dd/MM/yyyy')})`;
        } else {
          start = startOfDay(now);
          end = endOfDay(now);
          label = 'فترة مخصصة';
        }
        break;
      case 'allTime':
      default:
        start = null;
        end = null;
        label = 'كل الأوقات (إجمالي المبيعات منذ البداية)';
        break;
    }

    return { startDate: start, endDate: end, periodLabel: label };
  }, [periodPreset, selectedDay, customStartDate, customEndDate]);

  useEffect(() => {
    if (activeVersion) {
      loadAnalysisData();
    }
  }, [activeVersion, startDate, endDate]);

  const loadAnalysisData = async () => {
    if (!activeVersion) return;
    setLoading(true);

    try {
      // 1. Fetch all products in the active version
      let allProducts: any[] = [];
      let pFrom = 0;
      const batchSize = 1000;
      let pHasMore = true;

      while (pHasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('id, code, name, description, price, stock_quantity, image_url')
          .eq('version_id', activeVersion.id)
          .order('code', { ascending: true })
          .range(pFrom, pFrom + batchSize - 1);

        if (error || !data || data.length === 0) {
          pHasMore = false;
        } else {
          allProducts = allProducts.concat(data);
          if (data.length < batchSize) pHasMore = false;
          else pFrom += batchSize;
        }
      }

      // 2. Fetch cancelled orders to exclude their items
      const { data: cancelledOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('version_id', activeVersion.id)
        .eq('status', 'cancelled');
      const cancelledOrderIds = new Set((cancelledOrders || []).map(o => o.id));

      // 3. Fetch order items in date range
      let allItems: any[] = [];
      let iFrom = 0;
      let iHasMore = true;

      while (iHasMore) {
        let q = supabase
          .from('order_items')
          .select('id, order_id, product_id, product_code, product_name, product_description, price, quantity, cancelled, created_at')
          .eq('version_id', activeVersion.id)
          .range(iFrom, iFrom + batchSize - 1);

        if (startDate) q = q.gte('created_at', startDate.toISOString());
        if (endDate) q = q.lte('created_at', endDate.toISOString());

        const { data, error } = await q;
        if (error || !data || data.length === 0) {
          iHasMore = false;
        } else {
          allItems = allItems.concat(data);
          if (data.length < batchSize) iHasMore = false;
          else iFrom += batchSize;
        }
      }

      // Filter out cancelled order items
      const validItems = allItems.filter(
        item => !item.cancelled && !cancelledOrderIds.has(item.order_id)
      );
      setRawOrderItems(validItems);

      // 4. Fetch orders details for customer metadata
      if (validItems.length > 0) {
        const orderIds = [...new Set(validItems.map(i => i.order_id))];
        const { data: ords } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, phone, created_at, status')
          .in('id', orderIds);
        const map = new Map((ords || []).map(o => [o.id, o]));
        setOrdersMap(map);
      } else {
        setOrdersMap(new Map());
      }

      // 5. Fetch refunds in date range
      let allRefunds: any[] = [];
      let rFrom = 0;
      let rHasMore = true;

      while (rHasMore) {
        let rq = supabase
          .from('order_refunds')
          .select('id, order_id, product_id, product_code, product_name, product_description, price, quantity, created_at')
          .eq('version_id', activeVersion.id)
          .range(rFrom, rFrom + batchSize - 1);

        if (startDate) rq = rq.gte('created_at', startDate.toISOString());
        if (endDate) rq = rq.lte('created_at', endDate.toISOString());

        const { data, error } = await rq;
        if (error || !data || data.length === 0) {
          rHasMore = false;
        } else {
          allRefunds = allRefunds.concat(data);
          if (data.length < batchSize) rHasMore = false;
          else rFrom += batchSize;
        }
      }

      // 6. Aggregate by product
      // Group items by product_id OR product_code
      const itemsByProductId = new Map<string, any[]>();
      const itemsByProductCode = new Map<string, any[]>();

      validItems.forEach(item => {
        if (item.product_id) {
          const list = itemsByProductId.get(item.product_id) || [];
          list.push(item);
          itemsByProductId.set(item.product_id, list);
        }
        if (item.product_code) {
          const list = itemsByProductCode.get(item.product_code) || [];
          list.push(item);
          itemsByProductCode.set(item.product_code, list);
        }
      });

      // Group refunds
      const refundsByProductId = new Map<string, any[]>();
      const refundsByProductCode = new Map<string, any[]>();

      allRefunds.forEach(rf => {
        if (rf.product_id) {
          const list = refundsByProductId.get(rf.product_id) || [];
          list.push(rf);
          refundsByProductId.set(rf.product_id, list);
        }
        if (rf.product_code) {
          const list = refundsByProductCode.get(rf.product_code) || [];
          list.push(rf);
          refundsByProductCode.set(rf.product_code, list);
        }
      });

      // Calculate stats per product
      const analysisList: ProductAnalysisItem[] = allProducts.map(prod => {
        const prodMultiplier = getDescriptionMultiplier(prod.description);

        // Find items matching this product
        const matchedItems = [
          ...(itemsByProductId.get(prod.id) || []),
          ...(itemsByProductCode.get(prod.code) || [])
        ];
        // Deduplicate in case both id and code matched
        const uniqueItems = Array.from(new Set(matchedItems.map(i => i.id)))
          .map(id => matchedItems.find(i => i.id === id)!);

        // Find refunds
        const matchedRefunds = [
          ...(refundsByProductId.get(prod.id) || []),
          ...(refundsByProductCode.get(prod.code) || [])
        ];
        const uniqueRefunds = Array.from(new Set(matchedRefunds.map(r => r.id)))
          .map(id => matchedRefunds.find(r => r.id === id)!);

        let packagesSold = 0;
        let piecesSold = 0;
        let grossRevenue = 0;
        const uniqueOrders = new Set<string>();

        uniqueItems.forEach(item => {
          const m = getDescriptionMultiplier(item.product_description) || prodMultiplier;
          const qty = Number(item.quantity) || 0;
          const pieces = qty * m;
          const itemPrice = Number(item.price) || Number(prod.price) || 0;
          const rev = itemPrice * pieces;

          packagesSold += qty;
          piecesSold += pieces;
          grossRevenue += rev;
          if (item.order_id) uniqueOrders.add(item.order_id);
        });

        let refundsPieces = 0;
        let refundRevenue = 0;
        uniqueRefunds.forEach(rf => {
          const m = getDescriptionMultiplier(rf.product_description) || prodMultiplier;
          const qty = Number(rf.quantity) || 0;
          const pieces = qty * m;
          const price = Number(rf.price) || Number(prod.price) || 0;
          refundsPieces += pieces;
          refundRevenue += price * pieces;
        });

        const netPiecesSold = Math.max(0, piecesSold - refundsPieces);
        const netRevenue = Math.max(0, grossRevenue - refundRevenue);

        return {
          id: prod.id,
          code: prod.code,
          name: prod.name,
          description: prod.description,
          price: Number(prod.price) || 0,
          stock_quantity: Number(prod.stock_quantity) || 0,
          image_url: prod.image_url,
          multiplier: prodMultiplier,
          ordersCount: uniqueOrders.size,
          packagesSold,
          piecesSold,
          grossRevenue,
          refundsPieces,
          refundRevenue,
          netPiecesSold,
          netRevenue,
          status: 'zero'
        };
      });

      // Assign performance status (Top, Medium, Low, Zero)
      const nonZeroItems = analysisList.filter(i => i.netPiecesSold > 0);
      const maxPieces = nonZeroItems.length > 0 ? Math.max(...nonZeroItems.map(i => i.netPiecesSold)) : 0;

      analysisList.forEach(item => {
        if (item.netPiecesSold === 0) {
          item.status = 'zero';
        } else if (item.netPiecesSold >= maxPieces * 0.4 || nonZeroItems.length <= 5) {
          item.status = 'top';
        } else if (item.netPiecesSold >= maxPieces * 0.15) {
          item.status = 'medium';
        } else {
          item.status = 'low';
        }
      });

      setProductsAnalysis(analysisList);
    } catch (err) {
      console.error('Failed to load products analysis:', err);
      toast.error('حدث خطأ أثناء تحميل تحليل المنتجات');
    } finally {
      setLoading(false);
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalProducts = productsAnalysis.length;
    const activeProducts = productsAnalysis.filter(p => p.netPiecesSold > 0);
    const zeroSalesProducts = productsAnalysis.filter(p => p.netPiecesSold === 0);

    const totalGrossRevenue = productsAnalysis.reduce((s, p) => s + p.grossRevenue, 0);
    const totalNetRevenue = productsAnalysis.reduce((s, p) => s + p.netRevenue, 0);
    const totalPiecesSold = productsAnalysis.reduce((s, p) => s + p.piecesSold, 0);
    const totalNetPieces = productsAnalysis.reduce((s, p) => s + p.netPiecesSold, 0);
    const totalPackages = productsAnalysis.reduce((s, p) => s + p.packagesSold, 0);
    const totalRefundsPieces = productsAnalysis.reduce((s, p) => s + p.refundsPieces, 0);

    // Sort by netPiecesSold to get top and least selling products
    const sortedBySales = [...activeProducts].sort((a, b) => b.netPiecesSold - a.netPiecesSold);
    const topSeller = sortedBySales.length > 0 ? sortedBySales[0] : null;
    const leastSeller = sortedBySales.length > 0 ? sortedBySales[sortedBySales.length - 1] : null;

    return {
      totalProducts,
      activeProductsCount: activeProducts.length,
      zeroSalesCount: zeroSalesProducts.length,
      totalGrossRevenue,
      totalNetRevenue,
      totalPiecesSold,
      totalNetPieces,
      totalPackages,
      totalRefundsPieces,
      topSeller,
      leastSeller,
      sortedBySales
    };
  }, [productsAnalysis]);

  // Top 10 for Bar Chart
  const top10ChartData = useMemo(() => {
    return kpis.sortedBySales.slice(0, 10).map((item, idx) => ({
      rank: `#${idx + 1}`,
      code: item.code,
      name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
      fullName: item.name,
      pieces: item.netPiecesSold,
      revenue: item.netRevenue,
    }));
  }, [kpis.sortedBySales]);

  // Filtered & Sorted Table Items
  const filteredTableItems = useMemo(() => {
    let result = [...productsAnalysis];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(item => item.status === statusFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        item =>
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'pieces_desc':
          return b.netPiecesSold - a.netPiecesSold || b.netRevenue - a.netRevenue;
        case 'pieces_asc':
          return a.netPiecesSold - b.netPiecesSold;
        case 'revenue_desc':
          return b.netRevenue - a.netRevenue;
        case 'revenue_asc':
          return a.netRevenue - b.netRevenue;
        case 'stock_desc':
          return b.stock_quantity - a.stock_quantity;
        case 'stock_asc':
          return a.stock_quantity - b.stock_quantity;
        case 'code_asc':
          return a.code.localeCompare(b.code, undefined, { numeric: true });
        default:
          return b.netPiecesSold - a.netPiecesSold;
      }
    });

    return result;
  }, [productsAnalysis, statusFilter, searchQuery, sortBy]);

  // Status Counts
  const counts = useMemo(() => {
    return {
      all: productsAnalysis.length,
      top: productsAnalysis.filter(p => p.status === 'top').length,
      medium: productsAnalysis.filter(p => p.status === 'medium').length,
      low: productsAnalysis.filter(p => p.status === 'low').length,
      zero: productsAnalysis.filter(p => p.status === 'zero').length,
    };
  }, [productsAnalysis]);

  // Open details modal for a single product
  const handleOpenDetails = (product: ProductAnalysisItem) => {
    setSelectedProduct(product);

    // Find all raw items for this product
    const matched = rawOrderItems.filter(
      item => item.product_id === product.id || item.product_code === product.code
    );

    const details: SaleOrderDetail[] = matched.map(item => {
      const order = ordersMap.get(item.order_id);
      const m = getDescriptionMultiplier(item.product_description) || product.multiplier;
      const qty = Number(item.quantity) || 0;
      const pieces = qty * m;
      const price = Number(item.price) || product.price || 0;

      return {
        order_id: item.order_id,
        order_number: order?.order_number || 0,
        customer_name: order?.customer_name || 'عميل غير مسجل',
        phone: order?.phone || '—',
        quantity: qty,
        pieces,
        price,
        total: price * pieces,
        created_at: item.created_at || order?.created_at || '',
      };
    });

    // Sort by order_number descending
    details.sort((a, b) => b.order_number - a.order_number);
    setProductOrderDetails(details);
    setDetailsDialogOpen(true);
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (productsAnalysis.length === 0) {
      toast.error('لا توجد بيانات لتصديرها');
      return;
    }

    const exportRows = filteredTableItems.map((item, index) => {
      const statusArabic =
        item.status === 'top'
          ? 'الأكثر مبيعاً 🔥'
          : item.status === 'medium'
          ? 'متوسط المبيعات ⚡'
          : item.status === 'low'
          ? 'أقل مبيعاً ❄️'
          : 'بدون مبيعات ⚠️';

      return {
        '#': index + 1,
        'كود المنتج': item.code,
        'اسم المنتج': item.name,
        'الوصف': item.description || '',
        'سعر القطعة (ج.م)': item.price,
        'المخزون المتبقي': item.stock_quantity,
        'عدد السيريهات المباعة': item.packagesSold,
        'إجمالي القطع المباعة': item.piecesSold,
        'المرتجعات (قطع)': item.refundsPieces,
        'صافي القطع المباعة': item.netPiecesSold,
        'صافي الإيرادات (ج.م)': Number(item.netRevenue.toFixed(2)),
        'عدد الطلبات': item.ordersCount,
        'تصنيف الأداء': statusArabic,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'تحليل المنتجات');

    const fileName = `تحليل_المنتجات_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('تم تصدير ملف الإكسيل بنجاح');
  };

  if (!hasPermission) {
    return <div className="text-center py-12 text-muted-foreground">غير مصرح بالوصول</div>;
  }

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Main Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            تحليل المنتجات (Products Analysis)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            تحليل شامل لأداء المنتجات، الأعلى مبيعاً، الأقل حركة، والراكدة ليوم محدد أو فترة زمنية مخصصة
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAnalysisData}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            تحديث
          </Button>

          <Button
            size="sm"
            onClick={handleExportExcel}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <FileSpreadsheet className="h-4 w-4" />
            تصدير تقرير Excel
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PERIOD SELECTION CONTROLS (اختيار اليوم أو الفترة الزمنية) */}
      {/* ========================================================================= */}
      <Card className="border-2 border-primary/20 shadow-sm bg-card">
        <CardHeader className="pb-3 pt-4 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-bold">تحديد فترة التحليل (By Day or Period)</CardTitle>
            </div>
            <Badge variant="outline" className="w-fit text-xs px-2.5 py-1 bg-primary/5 text-primary border-primary/30">
              <Clock className="h-3.5 w-3.5 ml-1.5" />
              {periodLabel}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Quick Presets Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'today' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('today')}
            >
              اليوم
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'yesterday' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('yesterday')}
            >
              أمس
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'last7' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('last7')}
            >
              آخر 7 أيام
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'last30' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('last30')}
            >
              آخر 30 يوماً
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'thisMonth' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('thisMonth')}
            >
              هذا الشهر
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'lastMonth' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('lastMonth')}
            >
              الشهر السابق
            </Button>
            <Button
              type="button"
              size="sm"
              variant={periodPreset === 'allTime' ? 'default' : 'outline'}
              className="text-xs h-8 font-semibold"
              onClick={() => setPeriodPreset('allTime')}
            >
              كل الأوقات (الكل)
            </Button>

            <span className="h-4 w-[1px] bg-border mx-1 hidden sm:inline" />

            {/* Specific Day Picker Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={periodPreset === 'singleDay' ? 'default' : 'outline'}
                  className="text-xs h-8 font-semibold gap-1.5"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {periodPreset === 'singleDay' && selectedDay
                    ? format(selectedDay, 'dd/MM/yyyy')
                    : 'يوم محدد...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={(day) => {
                    if (day) {
                      setSelectedDay(day);
                      setPeriodPreset('singleDay');
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* Custom Range Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={periodPreset === 'custom' ? 'default' : 'outline'}
                  className="text-xs h-8 font-semibold gap-1.5"
                >
                  <Filter className="h-3.5 w-3.5" />
                  فترة مخصصة (من - إلى)
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 space-y-3" align="start">
                <p className="text-xs font-bold text-foreground">تحديد فترة مخصصة بالتواريخ:</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">من تاريخ:</label>
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => {
                        setCustomStartDate(e.target.value);
                        setPeriodPreset('custom');
                      }}
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">إلى تاريخ:</label>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => {
                        setCustomEndDate(e.target.value);
                        setPeriodPreset('custom');
                      }}
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full text-xs font-bold mt-2"
                  onClick={() => setPeriodPreset('custom')}
                >
                  تطبيق الفترة
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SUMMARY KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-sm">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs font-semibold flex items-center justify-between">
              <span>إجمالي صافي مبيعات المنتجات</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-primary">
              {kpis.totalNetRevenue.toFixed(2)} ج.م
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-[11px] text-muted-foreground">
              {kpis.totalRefundsPieces > 0
                ? `بعد خصم ${kpis.totalRefundsPieces} قطعة مرتجع`
                : 'إجمالي القيمة المباعة في الفترة'}
            </p>
          </CardContent>
        </Card>

        {/* Total Pieces Sold */}
        <Card className="border-2 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs font-semibold flex items-center justify-between">
              <span>إجمالي القطع المباعة</span>
              <Package className="h-4 w-4 text-blue-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {kpis.totalNetPieces.toLocaleString('ar-EG')} قطعة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-[11px] text-muted-foreground">
              موزعة على {kpis.totalPackages.toLocaleString('ar-EG')} سيريه/باكت
            </p>
          </CardContent>
        </Card>

        {/* Top Seller Product */}
        <Card className="border-2 border-emerald-500/20 bg-emerald-500/5 shadow-sm">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs font-semibold flex items-center justify-between text-emerald-800 dark:text-emerald-300">
              <span>المنتج الأكثر مبيعاً 🔥</span>
              <Flame className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-xl font-black text-emerald-700 dark:text-emerald-400 truncate">
              {kpis.topSeller ? `#${kpis.topSeller.code} - ${kpis.topSeller.name}` : 'لا توجد مبيعات'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              {kpis.topSeller
                ? `تم بيع ${kpis.topSeller.netPiecesSold} قطعة (${kpis.topSeller.netRevenue.toFixed(0)} ج.م)`
                : 'في الفترة المحددة'}
            </p>
          </CardContent>
        </Card>

        {/* Zero Sales Products */}
        <Card className="border-2 border-amber-500/20 bg-amber-500/5 shadow-sm">
          <CardHeader className="pb-1">
            <CardDescription className="text-xs font-semibold flex items-center justify-between text-amber-800 dark:text-amber-300">
              <span>منتجات راكدة (بدون مبيعات) ⚠️</span>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {kpis.zeroSalesCount} منتج
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              {kpis.totalProducts > 0
                ? `${((kpis.zeroSalesCount / kpis.totalProducts) * 100).toFixed(0)}% من كتالوج المنتجات لم يباع`
                : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* VISUAL HIGHLIGHTS: TOP 10 CHART & LEAST SELLING PREVIEW */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 10 Chart (2 columns on lg) */}
        <Card className="lg:col-span-2 border-2 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-base font-bold">
                  أعلى 10 منتجات مبيعاً بالقطع (Top 10 Selling Products)
                </CardTitle>
              </div>
              <Badge variant="secondary" className="text-xs">
                {periodLabel}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              رسم بياني يوضح عدد القطع المباعة لكل منتج من المنتجات الأكثر طلباً
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            {top10ChartData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
                لا توجد مبيعات مسجلة في هذه الفترة لعرض الرسم البياني
              </div>
            ) : (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={top10ChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                  >
                    <XAxis
                      dataKey="code"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border p-2.5 rounded-lg shadow-md text-xs space-y-1">
                              <p className="font-bold text-foreground">
                                {data.fullName} (#{data.code})
                              </p>
                              <p className="text-primary font-semibold">
                                القطع المباعة: {data.pieces} قطعة
                              </p>
                              <p className="text-muted-foreground">
                                الإيرادات: {Number(data.revenue).toFixed(2)} ج.م
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="pieces" radius={[6, 6, 0, 0]}>
                      {top10ChartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 0 ? '#10b981' : index < 3 ? '#00bfff' : '#6366f1'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Least Selling Products Box */}
        <Card className="border-2 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-base font-bold">المنتجات الأقل حركة (Least Selling)</CardTitle>
            </div>
            <CardDescription className="text-xs">
              منتجات بيع منها قطع قليلة جداً وتحتاج لمراجعة المخزون والتسويق
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2 flex-1">
            {kpis.sortedBySales.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">
                لا توجد بيانات مبيعات
              </div>
            ) : (
              <div className="space-y-2.5">
                {kpis.sortedBySales
                  .slice(-5)
                  .reverse()
                  .map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => handleOpenDetails(prod)}
                      className="p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-all cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">#{prod.code}</span>
                        <span className="font-medium truncate max-w-[130px]">{prod.name}</span>
                      </div>
                      <div className="text-left">
                        <Badge variant="outline" className="text-[11px] font-bold text-amber-600 bg-amber-50">
                          {prod.netPiecesSold} قطعة
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          مخزون: {prod.stock_quantity}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* DETAILED PRODUCTS ANALYSIS TABLE */}
      {/* ========================================================================= */}
      <Card className="border-2 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span>جدول التحليل الشامل للمنتجات ({filteredTableItems.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                عرض تفصيلي لكل كود مع إجمالي القطع، السيريهات، المرتجعات، الإيرادات والمخزون
              </CardDescription>
            </div>

            {/* Filter Tabs by Performance */}
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as any)}
              className="w-full lg:w-auto"
            >
              <TabsList className="grid grid-cols-5 w-full lg:w-auto h-9">
                <TabsTrigger value="all" className="text-xs">
                  الكل ({counts.all})
                </TabsTrigger>
                <TabsTrigger value="top" className="text-xs text-emerald-600">
                  الأكثر ({counts.top})
                </TabsTrigger>
                <TabsTrigger value="medium" className="text-xs text-blue-600">
                  متوسط ({counts.medium})
                </TabsTrigger>
                <TabsTrigger value="low" className="text-xs text-amber-600">
                  الأقل ({counts.low})
                </TabsTrigger>
                <TabsTrigger value="zero" className="text-xs text-rose-600">
                  راكدة ({counts.zero})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Search and Sort Row */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بكود المنتج، الاسم، الوصف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[220px] h-9 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
                  <SelectValue placeholder="ترتيب حسب..." />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="pieces_desc">الأكثر مبيعاً (بالقطع)</SelectItem>
                  <SelectItem value="revenue_desc">الأعلى إيراداً (ج.م)</SelectItem>
                  <SelectItem value="pieces_asc">الأقل مبيعاً (بالقطع)</SelectItem>
                  <SelectItem value="stock_desc">الأعلى مخزوناً</SelectItem>
                  <SelectItem value="stock_asc">الأقل مخزوناً</SelectItem>
                  <SelectItem value="code_asc">كود المنتج (تصاعدي)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 p-0 sm:p-4">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">جاري تجميع وتحليل بيانات المنتجات في الفترة المحددة...</p>
            </div>
          ) : filteredTableItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد منتجات تطابق الفلاتر المحددة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground font-semibold">
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">الكود</th>
                    <th className="p-3">المنتج</th>
                    <th className="p-3">السعر</th>
                    <th className="p-3">المخزون الحالي</th>
                    <th className="p-3 text-center">السيريهات المباعة</th>
                    <th className="p-3 text-center">إجمالي القطع</th>
                    <th className="p-3 text-center">المرتجعات</th>
                    <th className="p-3 text-center">صافي القطع</th>
                    <th className="p-3">صافي الإيرادات</th>
                    <th className="p-3 text-center">حالة الأداء</th>
                    <th className="p-3 text-center">تفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTableItems.map((prod, idx) => (
                    <tr
                      key={prod.id}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        prod.status === 'top' && 'bg-emerald-500/[0.02]',
                        prod.status === 'zero' && 'bg-rose-500/[0.02]'
                      )}
                    >
                      <td className="p-3 text-center text-muted-foreground font-mono">
                        {idx + 1}
                      </td>

                      <td className="p-3 font-extrabold text-primary font-mono text-sm">
                        #{prod.code}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <ProductImage
                            imageUrl={prod.image_url}
                            alt={prod.name}
                            size="sm"
                            className="h-10 w-10 rounded-md border"
                          />
                          <div>
                            <p className="font-semibold text-foreground">{prod.name}</p>
                            {prod.description && (
                              <p className="text-[10px] text-muted-foreground">{prod.description}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3 font-medium">
                        {prod.price} ج.م
                      </td>

                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[11px] font-mono',
                            prod.stock_quantity <= 0 && 'border-rose-500 text-rose-600 bg-rose-50',
                            prod.stock_quantity > 0 && prod.stock_quantity <= 10 && 'border-amber-500 text-amber-600 bg-amber-50',
                            prod.stock_quantity > 10 && 'border-slate-300'
                          )}
                        >
                          {prod.stock_quantity}
                        </Badge>
                      </td>

                      <td className="p-3 text-center font-bold text-foreground font-mono">
                        {prod.packagesSold}
                      </td>

                      <td className="p-3 text-center font-bold text-foreground font-mono">
                        {prod.piecesSold}
                      </td>

                      <td className="p-3 text-center">
                        {prod.refundsPieces > 0 ? (
                          <span className="text-rose-600 font-bold font-mono">
                            -{prod.refundsPieces}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <span
                          className={cn(
                            'font-black font-mono text-sm px-2 py-0.5 rounded',
                            prod.netPiecesSold > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                          )}
                        >
                          {prod.netPiecesSold}
                        </span>
                      </td>

                      <td className="p-3 font-bold text-foreground font-mono">
                        {prod.netRevenue.toFixed(2)} ج.م
                      </td>

                      <td className="p-3 text-center">
                        {prod.status === 'top' && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-1">
                            <Flame className="h-3 w-3" /> أكثر مبيعاً
                          </Badge>
                        )}
                        {prod.status === 'medium' && (
                          <Badge variant="secondary" className="text-blue-700 bg-blue-100 text-[10px] gap-1">
                            متوسط ⚡
                          </Badge>
                        )}
                        {prod.status === 'low' && (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] gap-1">
                            <Snowflake className="h-3 w-3" /> أقل مبيعاً
                          </Badge>
                        )}
                        {prod.status === 'zero' && (
                          <Badge variant="outline" className="text-rose-700 border-rose-300 bg-rose-50 text-[10px] gap-1">
                            راكد ⚠️
                          </Badge>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"
                          onClick={() => handleOpenDetails(prod)}
                          title="عرض تفاصيل الطلبات لهذا المنتج"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          عرض
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* PRODUCT SALES DETAILS DIALOG (تفاصيل مبيعات المنتج والطلبات) */}
      {/* ========================================================================= */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedProduct && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <ProductImage
                    imageUrl={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    size="sm"
                    className="h-12 w-12 rounded-lg border"
                  />
                  <div>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                      <span>{selectedProduct.name}</span>
                      <Badge variant="outline" className="font-mono text-primary">
                        #{selectedProduct.code}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      تفاصيل مبيعات هذا المنتج خلال: <strong>{periodLabel}</strong>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Product Quick Stats in Dialog */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted/50 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">سعر القطعة</span>
                  <span className="font-bold text-sm">{selectedProduct.price} ج.م</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">صافي القطع المباعة</span>
                  <span className="font-bold text-sm text-primary">{selectedProduct.netPiecesSold} قطعة</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">صافي الإيراد</span>
                  <span className="font-bold text-sm text-emerald-600">{selectedProduct.netRevenue.toFixed(2)} ج.م</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">المخزون الحالي</span>
                  <span className="font-bold text-sm">{selectedProduct.stock_quantity} قطعة</span>
                </div>
              </div>

              {/* Orders List Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm flex items-center gap-1.5">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  قائمة الطلبات التي اشترت هذا المنتج ({productOrderDetails.length} طلب)
                </h4>

                {productOrderDetails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    لم يتم تسجيل أي طلبات شراء لهذا المنتج خلال هذه الفترة
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/60 text-muted-foreground font-semibold">
                          <th className="p-2.5">رقم الطلب</th>
                          <th className="p-2.5">العميل</th>
                          <th className="p-2.5">الهاتف</th>
                          <th className="p-2.5 text-center">السيريهات</th>
                          <th className="p-2.5 text-center">القطع</th>
                          <th className="p-2.5">الإجمالي</th>
                          <th className="p-2.5">التاريخ والوقت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {productOrderDetails.map((od, i) => (
                          <tr key={`${od.order_id}-${i}`} className="hover:bg-muted/30">
                            <td className="p-2.5 font-bold text-primary font-mono">
                              #{od.order_number}
                            </td>
                            <td className="p-2.5 font-medium">
                              {od.customer_name}
                            </td>
                            <td className="p-2.5 text-muted-foreground font-mono">
                              {od.phone}
                            </td>
                            <td className="p-2.5 text-center font-mono font-semibold">
                              {od.quantity}
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-primary">
                              {od.pieces}
                            </td>
                            <td className="p-2.5 font-semibold font-mono">
                              {od.total.toFixed(2)} ج.م
                            </td>
                            <td className="p-2.5 text-muted-foreground text-[11px]">
                              {od.created_at ? format(new Date(od.created_at), 'dd/MM/yyyy HH:mm') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductsAnalysis;
