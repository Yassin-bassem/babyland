import { useEffect, useState } from 'react';
import { Package, ShoppingCart, Users, TrendingUp, AlertTriangle, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { toast } from 'sonner';

interface Stats {
  totalProducts: number;
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  lowStockProducts: number;
}

interface StockAlert {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  remaining_quantity: number;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  version_id: string;
}

const Stats = () => {
  const { activeVersion } = useVersion();
  const isFullAdmin = sessionStorage.getItem('babyland_admin') === 'true';
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalOrders: 0,
    totalCustomers: 0,
    totalRevenue: 0,
    lowStockProducts: 0,
  });
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [acknowledgedProductIds, setAcknowledgedProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeVersion) {
      loadStats();

      // Realtime subscription to update statistics dynamically
      const channel = supabase
        .channel('stats-realtime-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          loadStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          loadStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
          loadStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_alerts' }, () => {
          loadStats();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeVersion]);

  const loadStats = async () => {
    if (!activeVersion) return;

    const [products, orders, customers, alerts, lowStock] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact' }).eq('version_id', activeVersion.id),
      supabase.from('orders').select('total, deposit_amount').eq('version_id', activeVersion.id),
      supabase.from('customers').select('id', { count: 'exact' }).eq('version_id', activeVersion.id),
      supabase.from('stock_alerts').select('*').eq('version_id', activeVersion.id).order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('version_id', activeVersion.id).filter('stock_quantity', 'lte', 10),
    ]);

    const totalRevenue = orders.data?.reduce((sum, o) => sum + (o.total || 0) + (o.deposit_amount || 0), 0) || 0;

    setStats({
      totalProducts: products.count || 0,
      totalOrders: orders.data?.length || 0,
      totalCustomers: customers.count || 0,
      totalRevenue,
      lowStockProducts: lowStock.data?.length || 0,
    });

    if (alerts.data) {
      setStockAlerts(alerts.data as StockAlert[]);
      const ackIds = new Set(
        (alerts.data as StockAlert[]).filter(a => a.acknowledged).map(a => a.product_id)
      );
      setAcknowledgedProductIds(ackIds);
    }
    if (lowStock.data) setLowStockItems(lowStock.data);
  };

  const handleAcknowledgeProduct = async (item: any) => {
    if (!activeVersion) return;
    // Create a stock alert record marked as acknowledged
    const { error } = await supabase.from('stock_alerts').insert({
      product_id: item.id,
      product_code: item.code,
      product_name: item.name,
      remaining_quantity: item.stock_quantity,
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      version_id: activeVersion.id,
    });

    if (error) {
      toast.error('فشل في تحديث التنبيه');
    } else {
      toast.success('تم تأكيد التنبيه');
      setAcknowledgedProductIds(prev => new Set([...prev, item.id]));
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    const { error } = await supabase
      .from('stock_alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);

    if (error) {
      toast.error('فشل في تحديث التنبيه');
    } else {
      toast.success('تم تأكيد التنبيه');
      loadStats();
    }
  };

  const statCards = [
    { title: 'المنتجات', value: stats.totalProducts, icon: Package, color: 'text-primary' },
    { title: 'الطلبات', value: stats.totalOrders, icon: ShoppingCart, color: 'text-secondary' },
    { title: 'العملاء', value: stats.totalCustomers, icon: Users, color: 'text-primary' },
    ...(isFullAdmin ? [{ title: 'الإيرادات', value: `${stats.totalRevenue.toFixed(2)} ج.م`, icon: TrendingUp, color: 'text-secondary' }] : []),
  ];

  const newAlerts = stockAlerts.filter(a => !a.acknowledged);
  const acknowledgedAlerts = stockAlerts.filter(a => a.acknowledged);

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الإحصائيات</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="border-2 border-border hover:border-primary/20 transition-colors">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl bg-muted ${stat.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Low Stock Products */}
      {lowStockItems.length > 0 && (
        <Card className="border-2 border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              تنبيه المخزون المنخفض ({lowStockItems.length} منتج)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => {
                const isAcknowledged = acknowledgedProductIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isAcknowledged
                        ? 'bg-green-50 border border-green-300 opacity-70'
                        : 'bg-destructive/10 border border-destructive/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{isAcknowledged ? '✅' : item.stock_quantity <= 0 ? '🔴' : '🟡'}</span>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">#{item.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${item.stock_quantity === 0 ? 'text-destructive' : 'text-amber-500'}`}>
                        {item.stock_quantity} متبقي
                      </span>
                      {isAcknowledged ? (
                        <Badge className="bg-green-100 text-green-800">تم التأكيد</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAcknowledgeProduct(item)}
                          className="bg-green-600 hover:bg-green-700 text-white gap-1"
                        >
                          <Check className="h-4 w-4" />
                          تم
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Alerts from alerts table */}
      {stockAlerts.length > 0 && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-primary">
                <AlertTriangle className="h-5 w-5" />
                تنبيهات المخزون ({stockAlerts.length})
              </span>
              {newAlerts.length > 0 && (
                <Badge variant="destructive">{newAlerts.length} جديد</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {newAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{alert.remaining_quantity <= 0 ? '🔴' : '🟡'}</span>
                    <div>
                      <p className="font-medium">{alert.product_name}</p>
                      <p className="text-sm text-muted-foreground">#{alert.product_code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${alert.remaining_quantity === 0 ? 'text-destructive' : 'text-amber-500'}`}>
                      {alert.remaining_quantity} متبقي
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleAcknowledge(alert.id)}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    >
                      <Check className="h-4 w-4" />
                      تم
                    </Button>
                  </div>
                </div>
              ))}
              {acknowledgedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-300 opacity-70"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">✅</span>
                    <div>
                      <p className="font-medium">{alert.product_name}</p>
                      <p className="text-sm text-muted-foreground">#{alert.product_code}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">تم التأكيد</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Stats;
