import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Version {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface VersionContextType {
  versions: Version[];
  activeVersion: Version | null;
  loading: boolean;
  setActiveVersion: (version: Version) => Promise<void>;
  createVersion: (name: string, mergeProducts?: boolean) => Promise<void>;
  renameVersion: (versionId: string, newName: string) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;
  loadVersions: () => Promise<void>;
}

const VersionContext = createContext<VersionContextType | undefined>(undefined);

export const VersionProvider = ({ children }: { children: ReactNode }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeVersion, setActiveVersionState] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVersions = async () => {
    const { data, error } = await supabase
      .from('versions')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading versions:', error);
      return;
    }

    const allVersions = data || [];

    // If locked by environment variable, only expose that specific version
    const lockedVersionId = import.meta.env.VITE_ACTIVE_VERSION_ID;
    if (lockedVersionId) {
      const locked = allVersions.find(v => v.id === lockedVersionId);
      if (locked) {
        setVersions([locked]);
        setActiveVersionState(locked);
        setLoading(false);
        return;
      }
    }

    setVersions(allVersions);

    // Retrieve from localStorage or default to active row in DB
    const savedVersionId = localStorage.getItem('babyland_active_version_id');
    let active = allVersions.find(v => v.id === savedVersionId);
    if (!active) {
      active = allVersions.find(v => v.is_active);
    }
    if (!active && allVersions.length > 0) {
      active = allVersions[0];
    }
    
    if (active) {
      setActiveVersionState(active);
      localStorage.setItem('babyland_active_version_id', active.id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadVersions();
  }, []);

  const setActiveVersion = async (version: Version) => {
    localStorage.setItem('babyland_active_version_id', version.id);
    setActiveVersionState(version);

    // Sync DB is_active flag across version records
    await supabase.from('versions').update({ is_active: false }).neq('id', version.id);
    await supabase.from('versions').update({ is_active: true }).eq('id', version.id);

    toast.success(`تم التبديل إلى نسخة: ${version.name}`);
    await loadVersions();
  };

  const createVersion = async (name: string, mergeProducts: boolean = false) => {
    if (!name.trim()) {
      toast.error('يرجى إدخال اسم النسخة');
      return;
    }

    const previousActiveVersion = activeVersion;

    // Reset previous active flags in DB
    await supabase.from('versions').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    // Create new version in DB as active
    const { data, error } = await supabase
      .from('versions')
      .insert({ name: name.trim(), is_active: true })
      .select()
      .single();

    if (error) {
      toast.error('فشل في إنشاء النسخة');
      return;
    }

    // Copy app_settings (like admin_password, staff_password) to new version
    if (previousActiveVersion && data) {
      const { data: oldSettings } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('version_id', previousActiveVersion.id);

      if (oldSettings && oldSettings.length > 0) {
        const newSettings = oldSettings.map(s => ({
          key: s.key,
          value: s.value,
          version_id: data.id,
        }));
        await supabase.from('app_settings').insert(newSettings);
      }
    }

    // Merge products from previous version if requested
    if (mergeProducts && previousActiveVersion && data) {
      const { data: oldProducts, error: fetchError } = await supabase
        .from('products')
        .select('code, name, description, price, image_url, stock_quantity, low_stock_threshold')
        .eq('version_id', previousActiveVersion.id);

      if (!fetchError && oldProducts && oldProducts.length > 0) {
        const newProducts = oldProducts.map(p => ({
          ...p,
          version_id: data.id,
        }));

        // Insert in batches of 100
        for (let i = 0; i < newProducts.length; i += 100) {
          const batch = newProducts.slice(i, i + 100);
          await supabase.from('products').insert(batch);
        }

        toast.success(`تم نسخ ${oldProducts.length} منتج إلى النسخة الجديدة`);
      }
    }

    toast.success(`تم إنشاء نسخة جديدة: ${name}`);
    localStorage.setItem('babyland_active_version_id', data.id);
    setActiveVersionState(data);
    await loadVersions();
  };

  const renameVersion = async (versionId: string, newName: string) => {
    if (!newName.trim()) {
      toast.error('يرجى إدخال اسم النسخة');
      return;
    }

    const { error } = await supabase
      .from('versions')
      .update({ name: newName.trim() })
      .eq('id', versionId);

    if (error) {
      toast.error('فشل في تغيير اسم النسخة');
      return;
    }

    toast.success('تم تغيير اسم النسخة');
    await loadVersions();
  };

  const deleteVersion = async (versionId: string) => {
    // Check if this is the only version
    if (versions.length <= 1) {
      toast.error('لا يمكن حذف النسخة الوحيدة');
      return;
    }

    // Check if trying to delete the active version
    const versionToDelete = versions.find(v => v.id === versionId);
    if (versionToDelete?.is_active) {
      toast.error('لا يمكن حذف النسخة النشطة. قم بتغيير النسخة أولاً');
      return;
    }

    // Delete all related data across all versioned tables to avoid FK constraints
    await supabase.from('order_items').delete().eq('version_id', versionId);
    await supabase.from('order_refunds').delete().eq('version_id', versionId);
    await supabase.from('order_returns').delete().eq('version_id', versionId);
    await supabase.from('deposits').delete().eq('version_id', versionId);
    await supabase.from('orders').delete().eq('version_id', versionId);
    await supabase.from('customers').delete().eq('version_id', versionId);
    await supabase.from('products').delete().eq('version_id', versionId);
    await supabase.from('expenses').delete().eq('version_id', versionId);
    await supabase.from('stock_alerts').delete().eq('version_id', versionId);
    await supabase.from('shipping_details').delete().eq('version_id', versionId);
    await supabase.from('staff_members').delete().eq('version_id', versionId);
    await supabase.from('app_settings').delete().eq('version_id', versionId);

    // Delete the version
    const { error } = await supabase
      .from('versions')
      .delete()
      .eq('id', versionId);

    if (error) {
      console.error('Error deleting version:', error);
      toast.error(error.message || 'فشل في حذف النسخة');
      return;
    }

    toast.success('تم حذف النسخة وجميع بياناتها');
    await loadVersions();
  };

  return (
    <VersionContext.Provider value={{ versions, activeVersion, loading, setActiveVersion, createVersion, renameVersion, deleteVersion, loadVersions }}>
      {children}
    </VersionContext.Provider>
  );
};

export const useVersion = () => {
  const context = useContext(VersionContext);
  if (!context) {
    throw new Error('useVersion must be used within a VersionProvider');
  }
  return context;
};
