import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDescriptionMultiplier } from '@/contexts/CartContext';

export type SalesMode = 'unlimited' | 'stop_at_zero' | 'allow_negative';

export interface SalesControlSettings {
  mode: SalesMode;
  negative_limit: number; // e.g. -20 means stock cannot go below -20 pieces
}

export const DEFAULT_SALES_CONTROL: SalesControlSettings = {
  mode: 'unlimited',
  negative_limit: -20,
};

export const SALES_CONTROL_KEY = 'sales_control';

export const parseSalesControl = (raw: string | null | undefined): SalesControlSettings => {
  if (!raw) return DEFAULT_SALES_CONTROL;
  try {
    const parsed = JSON.parse(raw);
    return {
      mode: (parsed.mode as SalesMode) || 'unlimited',
      negative_limit: typeof parsed.negative_limit === 'number' ? parsed.negative_limit : -20,
    };
  } catch {
    return DEFAULT_SALES_CONTROL;
  }
};

/**
 * Checks whether buying `addQuantity` (cart units) of a product is allowed.
 * Stock is in pieces; cart quantity is multiplied by description multiplier.
 */
export const canAddProductToCart = (
  settings: SalesControlSettings,
  product: { stock_quantity: number; description?: string | null },
  addCartQuantity: number,
  alreadyInCartQuantity: number = 0
): { allowed: boolean; reason?: string } => {
  if (settings.mode === 'unlimited') return { allowed: true };

  const multiplier = getDescriptionMultiplier(product.description || '');
  const totalPiecesAfter =
    product.stock_quantity - (alreadyInCartQuantity + addCartQuantity) * multiplier;

  if (settings.mode === 'stop_at_zero') {
    if (totalPiecesAfter < 0) {
      return {
        allowed: false,
        reason: 'هذا المنتج نفد من المخزون ولا يمكن إضافته للسلة',
      };
    }
    return { allowed: true };
  }

  if (settings.mode === 'allow_negative') {
    if (totalPiecesAfter < settings.negative_limit) {
      return {
        allowed: false,
        reason: `لا يمكن البيع، الحد المسموح به هو ${settings.negative_limit} قطعة`,
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
};

/**
 * React hook that loads + subscribes to sales control settings.
 */
export const useSalesControl = (): SalesControlSettings => {
  const [settings, setSettings] = useState<SalesControlSettings>(DEFAULT_SALES_CONTROL);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const activeVersionId = localStorage.getItem('babyland_active_version_id');
      let query = supabase
        .from('app_settings')
        .select('value')
        .eq('key', SALES_CONTROL_KEY);

      if (activeVersionId) {
        query = query.eq('version_id', activeVersionId);
      }

      let { data } = await query.maybeSingle();

      if (!data) {
        const { data: fallback } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', SALES_CONTROL_KEY)
          .limit(1)
          .maybeSingle();
        data = fallback;
      }

      if (!cancelled) setSettings(parseSalesControl(data?.value));
    };
    load();

    const channel = supabase
      .channel('sales-control-settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${SALES_CONTROL_KEY}` },
        (payload: any) => {
          const newVal = payload.new?.value;
          if (newVal) setSettings(parseSalesControl(newVal));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return settings;
};

/**
 * Fetch settings imperatively (for one-shot checks like QR scan).
 */
export const fetchSalesControl = async (): Promise<SalesControlSettings> => {
  const activeVersionId = localStorage.getItem('babyland_active_version_id');
  let query = supabase
    .from('app_settings')
    .select('value')
    .eq('key', SALES_CONTROL_KEY);

  if (activeVersionId) {
    query = query.eq('version_id', activeVersionId);
  }

  let { data } = await query.maybeSingle();

  if (!data) {
    const { data: fallback } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SALES_CONTROL_KEY)
      .limit(1)
      .maybeSingle();
    data = fallback;
  }

  return parseSalesControl(data?.value);
};
