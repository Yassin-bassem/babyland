import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, ShieldCheck, Ban, Infinity as InfinityIcon } from 'lucide-react';
import {
  DEFAULT_SALES_CONTROL,
  SALES_CONTROL_KEY,
  SalesControlSettings,
  SalesMode,
  parseSalesControl,
} from '@/hooks/use-sales-control';

import { useVersion } from '@/contexts/VersionContext';

const SalesControl = () => {
  const { activeVersion } = useVersion();
  const [settings, setSettings] = useState<SalesControlSettings>(DEFAULT_SALES_CONTROL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      let query = supabase
        .from('app_settings')
        .select('value')
        .eq('key', SALES_CONTROL_KEY);

      if (activeVersion) {
        query = query.eq('version_id', activeVersion.id);
      }

      let { data, error } = await query.maybeSingle();

      if (error || !data) {
        const { data: fallback } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', SALES_CONTROL_KEY)
          .limit(1)
          .maybeSingle();
        data = fallback;
      }

      setSettings(parseSalesControl(data?.value));
      setLoading(false);
    };
    load();
  }, [activeVersion]);

  const handleSave = async () => {
    setSaving(true);
    const value = JSON.stringify(settings);
    
    let query = supabase
      .from('app_settings')
      .update({ value })
      .eq('key', SALES_CONTROL_KEY);

    if (activeVersion) {
      query = query.eq('version_id', activeVersion.id);
    }

    const { error: updateError, data: updateData } = await query.select();

    if (updateError) {
      toast.error('فشل حفظ الإعدادات');
      setSaving(false);
      return;
    }

    if (!updateData || updateData.length === 0) {
      const insertObj: any = { key: SALES_CONTROL_KEY, value };
      if (activeVersion) insertObj.version_id = activeVersion.id;
      const { error: insertError } = await supabase
        .from('app_settings')
        .insert(insertObj);
      if (insertError) {
        toast.error('فشل حفظ الإعدادات');
        setSaving(false);
        return;
      }
    }

    toast.success('تم حفظ إعدادات البيع');
    setSaving(false);
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">التحكم في البيع</h1>
        <p className="text-muted-foreground mt-1">
          تحكم في طريقة بيع المنتجات بناءً على المخزون المتاح
        </p>
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-lg">اختر طريقة البيع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={settings.mode}
            onValueChange={(val) => setSettings({ ...settings, mode: val as SalesMode })}
            className="space-y-3"
          >
            {/* Unlimited */}
            <label
              htmlFor="mode-unlimited"
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                settings.mode === 'unlimited'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="unlimited" id="mode-unlimited" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold">
                  <InfinityIcon className="h-5 w-5 text-primary" />
                  بيع بدون حدود
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  السماح بالبيع دائماً دون أي قيود على المخزون
                </p>
              </div>
            </label>

            {/* Allow negative */}
            <label
              htmlFor="mode-negative"
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                settings.mode === 'allow_negative'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="allow_negative" id="mode-negative" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold">
                  <ShieldCheck className="h-5 w-5 text-secondary" />
                  السماح بالبيع حتى حد معين بالسالب
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  السماح بالبيع حتى يصل المخزون إلى الحد المحدد بالأسفل (مثلاً -20 قطعة)
                </p>
                {settings.mode === 'allow_negative' && (
                  <div className="mt-3 flex items-center gap-2">
                    <Label htmlFor="neg-limit" className="text-sm whitespace-nowrap">
                      الحد الأدنى (قطع):
                    </Label>
                    <Input
                      id="neg-limit"
                      type="number"
                      value={settings.negative_limit}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          negative_limit: parseInt(e.target.value) || 0,
                        })
                      }
                      className="max-w-[120px]"
                      dir="ltr"
                    />
                    <span className="text-sm text-muted-foreground">
                      (مثلاً: -20)
                    </span>
                  </div>
                )}
              </div>
            </label>

            {/* Stop at zero */}
            <label
              htmlFor="mode-stop"
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                settings.mode === 'stop_at_zero'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value="stop_at_zero" id="mode-stop" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold">
                  <Ban className="h-5 w-5 text-destructive" />
                  إيقاف البيع عند نفاد المخزون
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  منع البيع تماماً بمجرد وصول المخزون إلى صفر، مع تنبيه عند المسح أو البحث
                </p>
              </div>
            </label>
          </RadioGroup>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-2 border-muted bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm">
            <strong>ملاحظة:</strong> الإعدادات تُطبَّق على واجهة العميل (المسح والبحث) ومنع
            الإضافة للسلة. يمكن تغيير الإعدادات في أي وقت وستُطبَّق فوراً.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesControl;
