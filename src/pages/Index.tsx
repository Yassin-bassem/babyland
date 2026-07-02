import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useVersion } from '@/contexts/VersionContext';
import { toast } from 'sonner';
import Header from '@/components/Header';
import QRScanner from '@/components/QRScanner';
import CartPreview from '@/components/CartPreview';
import ProductSearch from '@/components/ProductSearch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, FileEdit } from 'lucide-react';
import { useSalesControl, canAddProductToCart } from '@/hooks/use-sales-control';

const Index = () => {
  const { addItem, items, extraInfo, setExtraInfo } = useCart();
  const { activeVersion } = useVersion();
  const salesControl = useSalesControl();

  const handleQRScan = useCallback(async (code: string) => {
    try {
      let query = supabase
        .from('products')
        .select('*')
        .eq('code', code);
      
      if (activeVersion) {
        query = query.eq('version_id', activeVersion.id);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (data) {
        const alreadyInCart =
          items.find((it) => it.productId === data.id)?.quantity || 0;
        const check = canAddProductToCart(salesControl, data, 1, alreadyInCart);
        if (!check.allowed) {
          toast.error(check.reason || 'لا يمكن إضافة هذا المنتج للسلة');
          return;
        }

        addItem({
          productId: data.id,
          code: data.code,
          name: data.name,
          description: data.description || '',
          price: data.price,
          imageUrl: data.image_url || undefined,
        });
        toast.success(`تمت إضافة "${data.name}" للسلة`);
      } else {
        toast.error('المنتج غير موجود');
      }
    } catch (err) {
      console.error('QR scan error:', err);
      toast.error('حدث خطأ في قراءة المنتج');
    }
  }, [addItem, activeVersion, items, salesControl]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-baby-blue-light via-background to-baby-pink-light">
      <Header />
      
      <main className="container py-6 space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-2 py-4">
          <h1 className="text-3xl font-bold gradient-text">مرحباً بك في Babyland</h1>
          <p className="text-muted-foreground">امسح كود المنتج أو ابحث بالكود لإضافته للسلة</p>
        </div>

        {/* QR Scanner - Primary Action */}
        <section className="slide-up">
          <QRScanner onScan={handleQRScan} />
        </section>

        {/* Cart Preview */}
        <section className="slide-up" style={{ animationDelay: '0.1s' }}>
          <CartPreview />
        </section>

        {/* Extra Info Box */}
        <section className="slide-up" style={{ animationDelay: '0.15s' }}>
          <Card className="border-2 border-border shadow-baby">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileEdit className="h-5 w-5 text-primary" />
                معلومات إضافية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="extraInfo" className="text-muted-foreground text-sm mb-2 block">
                أضف أي ملاحظات أو معلومات إضافية تريد إضافتها للفاتورة
              </Label>
              <Input
                id="extraInfo"
                placeholder="ملاحظات إضافية..."
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
              />
            </CardContent>
          </Card>
        </section>

        {/* Product Search */}
        <section className="slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="rounded-2xl border-2 border-border bg-card p-4 shadow-baby">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              البحث بكود المنتج
            </h2>
            <ProductSearch />
          </div>
        </section>

        {/* Made by Yassin Bassem Button */}
        <section className="slide-up" style={{ animationDelay: '0.25s' }}>
          <Button
            variant="outline"
            className="w-full py-6 text-lg font-bold rounded-xl border-2 border-green-500 text-green-600 hover:bg-green-50"
            onClick={() => window.open('https://wa.me/201033110143', '_blank')}
          >
            <MessageCircle className="h-5 w-5 ml-2 text-green-500" />
            made by yassin bassem
          </Button>
        </section>

        {/* Decorative Elements */}
        <div className="fixed -bottom-20 -right-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="fixed -bottom-20 -left-20 w-64 h-64 rounded-full bg-secondary/5 blur-3xl pointer-events-none" />
      </main>
    </div>
  );
};

export default Index;
