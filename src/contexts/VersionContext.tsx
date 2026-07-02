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
    toast.success(`تم التبديل إلى نسخة: ${version.name}`);
    await loadVersions();
  };

  const createVersion = async (name: string, mergeProducts: boolean = false) => {
    if (!name.trim()) {
      toast.error('يرجى إدخال اسم النسخة');
      return;
    }

    const previousActiveVersion = activeVersion;

    // Create new version in DB (default is_active to false to avoid global switching)
    const { data, error } = await supabase
      .from('versions')
      .insert({ name: name.trim(), is_active: false })
      .select()
      .single();

    if (error) {
      toast.error('فشل في إنشاء النسخة');
      return;
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

    // Delete all related data first
    await supabase.from('order_items').delete().eq('version_id', versionId);
    await supabase.from('deposits').delete().eq('version_id', versionId);
    await supabase.from('orders').delete().eq('version_id', versionId);
    await supabase.from('customers').delete().eq('version_id', versionId);
    await supabase.from('products').delete().eq('version_id', versionId);
    await supabase.from('expenses').delete().eq('version_id', versionId);

    // Delete the version
    const { error } = await supabase
      .from('versions')
      .delete()
      .eq('id', versionId);

    if (error) {
      toast.error('فشل في حذف النسخة');
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
