import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

const VERSIONED_TABLES = [
  'products', 'customers', 'orders', 'order_items',
  'deposits', 'expenses', 'shipping_details', 'stock_alerts',
  'order_returns', 'order_refunds', 'app_settings', 'staff_members',
] as const;
const GLOBAL_TABLES = [] as const;

const fetchAllRows = async (table: string, filter?: { column: string; value: string }) => {
  const pageSize = 1000;
  let from = 0;
  const rows: any[] = [];
  while (true) {
    let q: any = supabase.from(table as any).select('*').range(from, from + pageSize - 1);
    if (filter) q = q.eq(filter.column, filter.value);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
};

const buildPayload = (table: string, rows: any[]) => ({
  table, version: 1, exported_at: new Date().toISOString(), count: rows.length, rows,
});

const safeFolder = (name: string) =>
  name.replace(/[^a-zA-Z0-9\u0600-\u06FF_\- ]/g, '_').trim() || 'unnamed';

const getTimestamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const createFullBackupZip = async (): Promise<Blob> => {
  const zip = new JSZip();
  const manifest: any = {
    version: 2, layout: 'by-version', created_at: new Date().toISOString(),
    app: 'babyland', global: {}, versions: [],
  };

  const globalFolder = zip.folder('global')!;
  for (const table of GLOBAL_TABLES) {
    const rows = await fetchAllRows(table);
    globalFolder.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
    manifest.global[table] = rows.length;
  }

  const allVersions = await fetchAllRows('versions');
  globalFolder.file('versions.json', JSON.stringify(buildPayload('versions', allVersions), null, 2));
  manifest.global['versions'] = allVersions.length;

  const versionsFolder = zip.folder('versions')!;
  for (const v of allVersions as any[]) {
    const folderName = `${safeFolder(v.name)}__${v.id.slice(0, 8)}`;
    const vFolder = versionsFolder.folder(folderName)!;
    const versionManifest: any = { version_id: v.id, version_name: v.name, is_active: v.is_active, tables: {} };
    vFolder.file('_version.json', JSON.stringify(buildPayload('versions', [v]), null, 2));
    for (const table of VERSIONED_TABLES) {
      const rows = await fetchAllRows(table, { column: 'version_id', value: v.id });
      vFolder.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
      versionManifest.tables[table] = rows.length;
    }
    vFolder.file('manifest.json', JSON.stringify(versionManifest, null, 2));
    manifest.versions.push({ id: v.id, name: v.name, folder: `versions/${folderName}`, tables: versionManifest.tables });
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return await zip.generateAsync({ type: 'blob' });
};

const STORAGE_KEY = 'babyland_last_auto_backup_date';

const isDesktop = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const isNarrow = window.innerWidth < 1024;
  return !isMobileUA && !hasCoarsePointer && !isNarrow;
};

const todayKey = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const maybeAutoDownloadBackup = async () => {
  try {
    if (!isDesktop()) return;
    const today = todayKey();
    if (localStorage.getItem(STORAGE_KEY) === today) return;
    // Mark first to prevent double-trigger from StrictMode / re-mounts
    localStorage.setItem(STORAGE_KEY, today);
    const blob = await createFullBackupZip();
    downloadBlob(blob, `babyland-backup-${getTimestamp()}.zip`);
  } catch (err) {
    console.error('Auto backup failed:', err);
    // Clear marker so it retries later if it failed
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
};
