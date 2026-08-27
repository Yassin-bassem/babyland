import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVersion } from '@/contexts/VersionContext';

import { sendStockAlertTelegram } from '@/lib/telegramAlerts';

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

const StockAlerts = () => {
  const { activeVersion } = useVersion();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeVersion) {
      loadAlerts();

      const channel = supabase
        .channel('stock-alerts-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_alerts' }, (payload) => {
          const newAlert = payload.new as StockAlert;
          loadAlerts();
          // Trigger Telegram alert for newly inserted stock alert if recent
          if (newAlert && newAlert.product_code && newAlert.product_name) {
            sendStockAlertTelegram({
              code: newAlert.product_code,
              name: newAlert.product_name,
              stock_quantity: newAlert.remaining_quantity,
            });
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_alerts' }, () => {
          loadAlerts();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stock_alerts' }, () => {
          loadAlerts();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [activeVersion]);

  const loadAlerts = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_alerts')
      .select('*')
      .eq('version_id', activeVersion.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('فشل في تحميل التنبيهات');
    } else {
      setAlerts((data as StockAlert[]) || []);
    }
    setLoading(false);
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
      loadAlerts();
    }
  };

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  const newAlerts = alerts.filter(a => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter(a => a.acknowledged);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          تنبيهات المخزون
        </h1>
        {newAlerts.length > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-1">
            {newAlerts.length} تنبيه جديد
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : alerts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد تنبيهات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* New alerts */}
          {newAlerts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-destructive">تنبيهات جديدة</h2>
              {newAlerts.map((alert) => (
                <Card
                  key={alert.id}
                  className="border-2 border-destructive/50 bg-destructive/5 hover:shadow-lg transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">
                          {alert.remaining_quantity <= 0 ? '🔴' : '🟡'}
                        </div>
                        <div>
                          <p className="font-bold text-lg">{alert.product_name}</p>
                          <p className="text-sm text-muted-foreground">كود: {alert.product_code}</p>
                          <p className="text-sm font-medium mt-1">
                            {alert.remaining_quantity <= 0 ? (
                              <span className="text-destructive">نفذ من المخزون</span>
                            ) : (
                              <span className="text-amber-600">متبقي {alert.remaining_quantity} قطعة</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.created_at).toLocaleString('ar-EG')}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="bg-green-600 hover:bg-green-700 text-white gap-2"
                      >
                        <Check className="h-4 w-4" />
                        تم
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Acknowledged alerts */}
          {acknowledgedAlerts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-muted-foreground">تنبيهات سابقة</h2>
              {acknowledgedAlerts.map((alert) => (
                <Card
                  key={alert.id}
                  className="border border-green-300 bg-green-50/50 opacity-70"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">✅</div>
                        <div>
                          <p className="font-bold">{alert.product_name}</p>
                          <p className="text-sm text-muted-foreground">كود: {alert.product_code}</p>
                          <p className="text-xs text-muted-foreground">
                            تم التأكيد: {alert.acknowledged_at ? new Date(alert.acknowledged_at).toLocaleString('ar-EG') : ''}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-800">تم التأكيد</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StockAlerts;
