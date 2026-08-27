import { useEffect, useState, useRef } from 'react';
import { Plus, Edit2, Trash2, QrCode, Search, Package, Printer, CheckSquare, Square, FileSpreadsheet, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { useVersion } from '@/contexts/VersionContext';
import ProductImage from '@/components/ProductImage';
import { sendStockAlertTelegram } from '@/lib/telegramAlerts';

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
}

interface ImportFailure {
  row: number;
  code?: string;
  name?: string;
  reason: string;
}

interface ImportReport {
  total: number;
  success: number;
  failed: number;
  failures: ImportFailure[];
}

// XPrinter XP-370B dimensions in mm (1.57" x 0.79" with 0.05" margins)
const LABEL_WIDTH_MM = 39.88;
const LABEL_HEIGHT_MM = 20.07;

const sortProductsAscending = (list: Product[]): Product[] => {
  return [...list].sort((a, b) => {
    const codeA = a.code ? String(a.code).trim() : '';
    const codeB = b.code ? String(b.code).trim() : '';
    const numA = parseInt(codeA.replace(/\D/g, ''));
    const numB = parseInt(codeB.replace(/\D/g, ''));
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    return codeA.localeCompare(codeB, undefined, { numeric: true });
  });
};

const Products = () => {
  const { activeVersion } = useVersion();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [printSearchCode, setPrintSearchCode] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    price: 0,
    stock_quantity: 0,
    low_stock_threshold: 10,
  });

  useEffect(() => {
    if (activeVersion) {
      loadProducts();
    }
  }, [activeVersion]);

  const loadProducts = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('version_id', activeVersion.id);

    if (error) {
      toast.error('فشل في تحميل المنتجات');
    } else {
      setProducts(sortProductsAscending(data || []));
    }
    setLoading(false);
  };

  const filteredProducts = searchCode
    ? products.filter((p) => p.code.toLowerCase().includes(searchCode.toLowerCase()))
    : products;

  const printFilteredProducts = sortProductsAscending(
    printSearchCode
      ? products.filter((p) => 
          p.code.toLowerCase().includes(printSearchCode.toLowerCase()) ||
          p.name.toLowerCase().includes(printSearchCode.toLowerCase())
        )
      : products
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVersion) return;

    if (!formData.code || !formData.name) {
      toast.error('الكود والاسم مطلوبان');
      return;
    }

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(formData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast.success('تم تحديث المنتج');
      } else {
        const { error } = await supabase.from('products').insert({
          ...formData,
          version_id: activeVersion.id,
        });
        if (error) throw error;
        toast.success('تم إضافة المنتج');
      }

      // Check stock alert
      if (formData.stock_quantity <= 10) {
        sendStockAlertTelegram({
          code: formData.code,
          name: formData.name,
          stock_quantity: formData.stock_quantity,
        });
      }

      setDialogOpen(false);
      resetForm();
      loadProducts();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description || '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast.error('فشل في حذف المنتج');
    } else {
      toast.success('تم حذف المنتج');
      loadProducts();
    }
  };

  // Excel Sheet Import logic
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeVersion) return;

    setIsImporting(true);
    toast.info('جاري قراءة واستيراد ملف الإكسيل...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        toast.error('ملف الإكسيل فارغ');
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const findValue = (row: Record<string, any>, keywords: string[]) => {
        const key = Object.keys(row).find(k =>
          keywords.some(kw => k.trim().toLowerCase() === kw.toLowerCase() || k.trim().toLowerCase().includes(kw.toLowerCase()))
        );
        return key !== undefined ? row[key] : undefined;
      };

      let successCount = 0;
      let failCount = 0;
      const failures: ImportFailure[] = [];

      // Process rows in exact sheet order (ascending order)
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2; // Assuming line 1 is header

        const codeVal = findValue(row, ['الكود', 'كود', 'code', 'Code']);
        const nameVal = findValue(row, ['الاسم', 'اسم', 'name', 'Name']);
        const priceVal = findValue(row, ['السعر', 'سعر', 'price', 'Price']);
        const descVal = findValue(row, ['السعر/عدد الثري', 'عدد الثري', 'الثري', 'description', 'الوصف', 'وصف']);
        const stockVal = findValue(row, ['الكمية (قطع ليس ثريهات)', 'قطع ليس ثريهات', 'الكمية', 'كمية', 'stock', 'quantity']);
        const thresholdVal = findValue(row, ['حد التنبيه', 'التنبيه', 'تنبيه', 'threshold']);

        const code = codeVal !== undefined && codeVal !== null ? String(codeVal).trim() : '';
        const name = nameVal !== undefined && nameVal !== null ? String(nameVal).trim() : '';

        if (!code) {
          failCount++;
          failures.push({ row: rowNum, name, reason: 'كود المنتج مفقود' });
          continue;
        }

        if (!name) {
          failCount++;
          failures.push({ row: rowNum, code, reason: 'اسم المنتج مفقود' });
          continue;
        }

        const price = parseFloat(String(priceVal)) || 0;
        const descRaw = descVal !== undefined && descVal !== null ? String(descVal).trim() : '';
        let description = descRaw;
        if (descRaw) {
          if (descRaw.includes('/')) {
            description = descRaw;
          } else {
            description = `${price}/${descRaw}`;
          }
        }
        const stock_quantity = parseInt(String(stockVal)) || 0;
        const low_stock_threshold = thresholdVal !== undefined && thresholdVal !== null && String(thresholdVal).trim() !== ''
          ? parseInt(String(thresholdVal)) || 10
          : 10;

        try {
          // Check if product with this code exists in active version
          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('version_id', activeVersion.id)
            .eq('code', code)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { error: updateError } = await supabase
              .from('products')
              .update({
                name,
                description,
                price,
                stock_quantity,
                low_stock_threshold,
              })
              .eq('id', existing.id);

            if (updateError) throw updateError;
          } else {
            // Insert new
            const { error: insertError } = await supabase
              .from('products')
              .insert({
                code,
                name,
                description,
                price,
                stock_quantity,
                low_stock_threshold,
                version_id: activeVersion.id,
              });

            if (insertError) throw insertError;
          }

          successCount++;
        } catch (err: any) {
          failCount++;
          failures.push({
            row: rowNum,
            code,
            name,
            reason: err.message || 'حدث خطأ أثناء الحفظ في قاعدة البيانات',
          });
        }
      }

      setImportReport({
        total: rawRows.length,
        success: successCount,
        failed: failCount,
        failures,
      });

      setReportDialogOpen(true);
      await loadProducts();

      if (failCount === 0) {
        toast.success(`تم استيراد جميع المنتجات بنجاح (${successCount} منتج)`);
      } else {
        toast.warning(`تم استيراد ${successCount} منتج وتخطي ${failCount} منتج`);
      }
    } catch (err: any) {
      toast.error(`فشل في قراءة ملف الإكسيل: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const generateQRDataUrl = async (code: string): Promise<string> => {
    return await QRCode.toDataURL(code, {
      width: 80,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  };

  const generateQR = async (product: Product) => {
    try {
      const url = await generateQRDataUrl(product.code);
      setQrImageUrl(url);
      setSelectedProduct(product);
      setQrDialogOpen(true);
    } catch (err) {
      toast.error('فشل في إنشاء QR');
    }
  };

  const printSingleLabel = async (product: Product) => {
    try {
      const qrDataUrl = await generateQRDataUrl(product.code);
      printLabels([{ product, qrDataUrl }]);
    } catch (err) {
      toast.error('فشل في طباعة الباركود');
    }
  };

  const printSelectedLabels = async () => {
    if (selectedForPrint.size === 0) {
      toast.error('يرجى اختيار منتج واحد على الأقل');
      return;
    }

    try {
      const selectedList = products.filter(p => selectedForPrint.has(p.id));
      const sortedSelected = sortProductsAscending(selectedList);

      const labelData = await Promise.all(
        sortedSelected.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );

      printLabels(labelData);
      setPrintDialogOpen(false);
      setSelectedForPrint(new Set());
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  const printAllLabels = async () => {
    try {
      const sortedProducts = sortProductsAscending(printFilteredProducts);
      const labelData = await Promise.all(
        sortedProducts.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );
      printLabels(labelData);
      setPrintDialogOpen(false);
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  const printRangeLabels = async () => {
    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    if (isNaN(start) || isNaN(end) || start > end) {
      toast.error('أدخل نطاق صحيح');
      return;
    }
    try {
      const rangeProducts = sortProductsAscending(
        products.filter(p => {
          const num = parseInt(p.code.replace(/\D/g, ''));
          return !isNaN(num) && num >= start && num <= end;
        })
      );

      if (rangeProducts.length === 0) {
        toast.error('لا توجد منتجات في هذا النطاق');
        return;
      }

      const labelData = await Promise.all(
        rangeProducts.map(async (product) => {
          const qrDataUrl = await generateQRDataUrl(product.code);
          return { product, qrDataUrl };
        })
      );
      printLabels(labelData);
      toast.success(`تم طباعة ${rangeProducts.length} باركود`);
    } catch (err) {
      toast.error('فشل في طباعة الباركودات');
    }
  };

  const printLabels = (labels: { product: Product; qrDataUrl: string }[]) => {
    const labelsHtml = labels.map(({ product, qrDataUrl }) => `
      <div class="label">
        <div class="info">
          <div class="code">${product.code}</div>
          <div class="price">${product.price} ج.م</div>
        </div>
        <div class="qr-section">
          <img src="${qrDataUrl}" alt="QR" class="qr-code" />
          <div class="name">${product.name}</div>
        </div>
      </div>
    `).join('');

    const printHtml = `
      <!DOCTYPE html>
      <html dir="ltr" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>طباعة الباركود</title>
        <style>
          @page {
            size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: ${LABEL_WIDTH_MM}mm;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
          }
          .label {
            width: ${LABEL_WIDTH_MM}mm;
            height: ${LABEL_HEIGHT_MM}mm;
            padding: 1.1mm 1.4mm 0.9mm 2mm;
            display: grid;
            grid-template-columns: 1fr 17.5mm;
            align-items: center;
            column-gap: 0.7mm;
            page-break-after: always;
            overflow: hidden;
          }
          .label:last-child {
            page-break-after: auto;
          }
          .info {
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-end;
            gap: 0.8mm;
            text-align: right;
          }
          .code {
            font-size: 9pt;
            font-weight: bold;
            color: #000;
            white-space: nowrap;
          }
          .price {
            font-size: 9pt;
            font-weight: bold;
            color: #000;
            white-space: nowrap;
          }
          .qr-section {
            width: 17.5mm;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding-top: 0.2mm;
            gap: 0.4mm;
          }
          .qr-code {
            width: 13mm;
            height: 13mm;
            object-fit: contain;
            image-rendering: crisp-edges;
          }
          .name {
            font-size: 6.8pt;
            color: #000;
            text-align: center;
            direction: rtl;
            font-weight: bold;
            line-height: 1.05;
            width: 16.8mm;
            min-height: 4.2mm;
            overflow: hidden;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHtml);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  const toggleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedForPrint);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedForPrint(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedForPrint.size === printFilteredProducts.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(printFilteredProducts.map(p => p.id)));
    }
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      price: 0,
      stock_quantity: 0,
      low_stock_threshold: 10,
    });
  };

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <div className="flex gap-2 flex-wrap">
          {/* Excel Import Hidden Input & Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleExcelImport}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <Button
            variant="outline"
            className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isImporting ? 'جاري الاستيراد...' : 'استيراد من إكسيل'}
          </Button>

          <Button variant="outline" className="gap-2" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="h-4 w-4" />
            طباعة الباركود
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>الكود *</Label>
                    <Input
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label>السعر *</Label>
                    <Input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <Label>الاسم *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>السعر/عدد الثري</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="مثلاً: 250/10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>الكمية (قطع ليس ثريهات)</Label>
                    <Input
                      type="number"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label>حد التنبيه</Label>
                    <Input
                      type="number"
                      value={formData.low_stock_threshold}
                      onChange={(e) => setFormData({ ...formData, low_stock_threshold: parseInt(e.target.value) || 10 })}
                      dir="ltr"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  {editingProduct ? 'تحديث' : 'إضافة'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث بالكود..."
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          className="pr-10"
          dir="ltr"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : filteredProducts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد منتجات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-baby transition-shadow">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <ProductImage imageUrl={product.image_url} alt={product.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">#{product.code}</p>
                    <h3 className="font-bold truncate">{product.name}</h3>
                    {product.description && (
                      <p className="text-xs text-muted-foreground truncate">{product.description}</p>
                    )}
                    <p className="text-sm text-primary font-bold">{product.price} ج.م</p>
                    <p className={`text-xs ${product.stock_quantity <= product.low_stock_threshold ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                      المخزون: {product.stock_quantity}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => generateQR(product)}>
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printSingleLabel(product)}>
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(product)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(product.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            <div className="border-2 border-border rounded-lg p-4 bg-white">
              <img src={qrImageUrl} alt="QR Code" className="w-32 h-32 mx-auto" />
              <div className="mt-2 text-center">
                <p className="text-lg font-bold text-black">#{selectedProduct?.code}</p>
                <p className="text-sm text-gray-600 truncate max-w-[180px]">{selectedProduct?.name}</p>
                <p className="text-md font-bold text-black">{selectedProduct?.price} ج.م</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = qrImageUrl;
                  link.download = `qr-${selectedProduct?.code}.png`;
                  link.click();
                }}
              >
                تحميل
              </Button>
              {selectedProduct && (
                <Button onClick={() => printSingleLabel(selectedProduct)}>
                  <Printer className="h-4 w-4 ml-2" />
                  طباعة
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Selection Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={(open) => { setPrintDialogOpen(open); if (!open) setPrintSearchCode(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>طباعة الباركود</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالكود أو الاسم..."
                value={printSearchCode}
                onChange={(e) => setPrintSearchCode(e.target.value)}
                className="pr-10"
                dir="rtl"
              />
            </div>
            <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50 flex-wrap">
              <Label className="shrink-0 text-sm">من</Label>
              <Input
                type="number"
                placeholder="مثال: 1000"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="w-24"
                dir="ltr"
              />
              <Label className="shrink-0 text-sm">إلى</Label>
              <Input
                type="number"
                placeholder="مثال: 1010"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="w-24"
                dir="ltr"
              />
              <Button onClick={printRangeLabels} size="sm" className="shrink-0">
                <Printer className="h-4 w-4 ml-1" />
                طباعة
              </Button>
              <Button variant="outline" size="sm" onClick={toggleSelectAll} className="gap-1">
                {selectedForPrint.size === printFilteredProducts.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                تحديد الكل
              </Button>
              <Button variant="outline" size="sm" onClick={printAllLabels}>
                طباعة الكل ({printFilteredProducts.length})
              </Button>
              <Button size="sm" onClick={printSelectedLabels} disabled={selectedForPrint.size === 0}>
                طباعة المحدد ({selectedForPrint.size})
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {printFilteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                  onClick={() => toggleSelectProduct(product.id)}
                >
                  {selectedForPrint.has(product.id) ? (
                    <CheckSquare className="h-5 w-5 text-primary" />
                  ) : (
                    <Square className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">#{product.code}</p>
                  </div>
                  <p className="font-bold">{product.price} ج.م</p>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              تقرير استيراد المنتجات من إكسيل
            </DialogTitle>
          </DialogHeader>

          {importReport && (
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Stat Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3 bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground">إجمالي الصفوف</p>
                  <p className="text-xl font-bold">{importReport.total}</p>
                </div>
                <div className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> الناجح
                  </p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{importReport.success}</p>
                </div>
                <div className="border border-rose-200 bg-rose-50 dark:bg-rose-950/30 rounded-lg p-3 text-center">
                  <p className="text-xs text-rose-700 dark:text-rose-400 flex items-center justify-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> الفاشل
                  </p>
                  <p className="text-xl font-bold text-rose-700 dark:text-rose-400">{importReport.failed}</p>
                </div>
              </div>

              {/* Failures List */}
              {importReport.failures.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                    تفاصيل الصفوف التي تعذر استيرادها ({importReport.failures.length})
                  </h4>
                  <div className="border rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="p-2 border-b">رقم الصف</th>
                          <th className="p-2 border-b">الكود</th>
                          <th className="p-2 border-b">الاسم</th>
                          <th className="p-2 border-b">سبب الفشل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importReport.failures.map((f, idx) => (
                          <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="p-2 font-mono">{f.row}</td>
                            <td className="p-2 font-mono">{f.code || '-'}</td>
                            <td className="p-2">{f.name || '-'}</td>
                            <td className="p-2 text-rose-600 font-medium">{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 rounded-lg text-center text-emerald-800 dark:text-emerald-300 text-sm font-medium">
                  🎉 تم استيراد جميع المنتجات في الملف بنجاح دون أي أخطاء!
                </div>
              )}

              <Button className="w-full mt-2" onClick={() => setReportDialogOpen(false)}>
                إغلاق التقرير
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
