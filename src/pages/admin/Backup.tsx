import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Database, FileJson, AlertTriangle, Loader2, FileArchive, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import JSZip from 'jszip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

// Tables that are scoped per version (have a version_id column).
const VERSIONED_TABLES = [
  'products',
  'customers',
  'orders',
  'order_items',
  'deposits',
  'expenses',
  'shipping_details',
  'stock_alerts',
  'order_returns',
  'order_refunds',
  'app_settings',
  'staff_members',
] as const;

// Tables that are global (not tied to a specific version).
const GLOBAL_TABLES = [] as const;

type VersionedTable = typeof VERSIONED_TABLES[number];
type GlobalTable = typeof GLOBAL_TABLES[number];
type TableName = VersionedTable | GlobalTable | 'versions';

const ALL_TABLES: TableName[] = ['versions', ...GLOBAL_TABLES, ...VERSIONED_TABLES];

const TABLE_LABELS: Record<TableName, string> = {
  versions: 'النسخ',
  app_settings: 'إعدادات التطبيق',
  staff_members: 'الموظفين',
  products: 'المنتجات',
  customers: 'العملاء',
  orders: 'الطلبات',
  order_items: 'عناصر الطلبات',
  deposits: 'العرابين',
  expenses: 'المصروفات',
  shipping_details: 'تفاصيل الشحن',
  stock_alerts: 'تنبيهات المخزون',
  order_returns: 'مرتجعات الطلبات',
  order_refunds: 'مستردات الطلبات',
};

// Restore order respects foreign-key-like dependencies.
const RESTORE_ORDER: TableName[] = [
  'versions',
  'app_settings',
  'staff_members',
  'products',
  'customers',
  'orders',
  'order_items',
  'deposits',
  'expenses',
  'shipping_details',
  'stock_alerts',
  'order_returns',
  'order_refunds',
];

interface VersionRow {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

const fetchAllRows = async (
  table: TableName,
  filter?: { column: string; value: string }
): Promise<any[]> => {
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

const getTimestamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

// Sanitize version name for folder use
const safeFolder = (name: string) => name.replace(/[^a-zA-Z0-9\u0600-\u06FF_\- ]/g, '_').trim() || 'unnamed';

const buildPayload = (table: TableName, rows: any[]) => ({
  table,
  version: 1,
  exported_at: new Date().toISOString(),
  count: rows.length,
  rows,
});

const Backup = () => {
  const [loading, setLoading] = useState(false);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [versionsList, setVersionsList] = useState<VersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ table: TableName; rows: any[] }[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('versions')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setVersionsList(data || []);
    } catch (err: any) {
      toast.error('فشل في تحميل النسخ: ' + err.message);
    } finally {
      setVersionsLoading(false);
    }
  };

  // Build a ZIP organized by version folders
  const downloadFullBackup = async () => {
    setLoading(true);
    try {
      const zip = new JSZip();
      const manifest: any = {
        version: 2,
        layout: 'by-version',
        created_at: new Date().toISOString(),
        app: 'babyland',
        global: {},
        versions: [],
      };

      // 1. Global (non-versioned) tables → global/<table>.json
      const globalFolder = zip.folder('global')!;
      for (const table of GLOBAL_TABLES) {
        const rows = await fetchAllRows(table);
        globalFolder.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
        manifest.global[table] = rows.length;
      }

      // 2. Fetch all versions
      const allVersions = await fetchAllRows('versions');
      // Save the full versions list as a single file too (for restore)
      globalFolder.file('versions.json', JSON.stringify(buildPayload('versions', allVersions), null, 2));
      manifest.global['versions'] = allVersions.length;

      // 3. Per-version data → versions/<name>/<table>.json
      const versionsFolder = zip.folder('versions')!;
      for (const v of allVersions as VersionRow[]) {
        const folderName = `${safeFolder(v.name)}__${v.id.slice(0, 8)}`;
        const vFolder = versionsFolder.folder(folderName)!;
        const versionManifest: any = {
          version_id: v.id,
          version_name: v.name,
          is_active: v.is_active,
          tables: {},
        };

        // Save the version row itself for easy reference
        vFolder.file('_version.json', JSON.stringify(buildPayload('versions', [v]), null, 2));

        for (const table of VERSIONED_TABLES) {
          const rows = await fetchAllRows(table, { column: 'version_id', value: v.id });
          vFolder.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
          versionManifest.tables[table] = rows.length;
        }

        vFolder.file('manifest.json', JSON.stringify(versionManifest, null, 2));
        manifest.versions.push({
          id: v.id,
          name: v.name,
          folder: `versions/${folderName}`,
          tables: versionManifest.tables,
        });
      }

      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      zip.file(
        'README.txt',
        `Babyland Backup\n` +
          `Created: ${new Date().toISOString()}\n\n` +
          `Structure:\n` +
          `  global/                    Non-versioned tables (app settings, staff)\n` +
          `    app_settings.json\n` +
          `    staff_members.json\n` +
          `    versions.json            Full list of all versions\n` +
          `  versions/\n` +
          `    <version-name>__<id>/    Folder per version\n` +
          `      _version.json          The version row itself\n` +
          `      manifest.json          Counts for this version\n` +
          `      products.json\n` +
          `      customers.json\n` +
          `      orders.json\n` +
          `      order_items.json\n` +
          `      deposits.json\n` +
          `      expenses.json\n` +
          `      shipping_details.json\n` +
          `      stock_alerts.json\n` +
          `\nTo restore:\n` +
          `  - Upload the entire ZIP to restore everything.\n` +
          `  - Upload a single version folder zipped to restore one version.\n` +
          `  - Upload a single .json file to restore one table.\n`
      );

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `babyland-backup-${getTimestamp()}.zip`);
      toast.success('تم تنزيل النسخة الاحتياطية الكاملة');
    } catch (err: any) {
      toast.error('فشل في إنشاء النسخة الاحتياطية: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Download backup of a SINGLE version (as its own zip)
  const downloadSingleVersionBackup = async (v: VersionRow) => {
    setDownloadingVersion(v.id);
    try {
      const zip = new JSZip();
      const versionManifest: any = {
        version: 2,
        layout: 'single-version',
        created_at: new Date().toISOString(),
        version_id: v.id,
        version_name: v.name,
        tables: {},
      };

      zip.file('_version.json', JSON.stringify(buildPayload('versions', [v]), null, 2));

      for (const table of VERSIONED_TABLES) {
        const rows = await fetchAllRows(table, { column: 'version_id', value: v.id });
        zip.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
        versionManifest.tables[table] = rows.length;
      }

      zip.file('manifest.json', JSON.stringify(versionManifest, null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `babyland-version-${safeFolder(v.name)}-${getTimestamp()}.zip`);
      toast.success(`تم تنزيل نسخة: ${v.name}`);
    } catch (err: any) {
      toast.error('فشل التنزيل: ' + err.message);
    } finally {
      setDownloadingVersion(null);
    }
  };

  // Download global (non-versioned) tables only
  const downloadGlobalBackup = async () => {
    setDownloadingVersion('__global__');
    try {
      const zip = new JSZip();
      for (const table of GLOBAL_TABLES) {
        const rows = await fetchAllRows(table);
        zip.file(`${table}.json`, JSON.stringify(buildPayload(table, rows), null, 2));
      }
      const allVersions = await fetchAllRows('versions');
      zip.file('versions.json', JSON.stringify(buildPayload('versions', allVersions), null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `babyland-global-${getTimestamp()}.zip`);
      toast.success('تم تنزيل البيانات العامة');
    } catch (err: any) {
      toast.error('فشل التنزيل: ' + err.message);
    } finally {
      setDownloadingVersion(null);
    }
  };

  // Parse uploaded file into a list of {table, rows}. Supports:
  //  - new layout zip (global/ + versions/<name>/<table>.json)
  //  - single-version zip (flat <table>.json files)
  //  - old flat zip (<table>.json at root)
  //  - single JSON file
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const collected: { table: TableName; rows: any[] }[] = [];

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);

        // Walk every JSON file in the zip
        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, entry) => {
          if (entry.dir) return;
          if (!relativePath.endsWith('.json')) return;
          if (relativePath.endsWith('manifest.json')) return;
          const baseName = relativePath.split('/').pop() || '';
          // Skip _version.json (it's just a marker, version data restored from versions.json or root)
          // Actually we want it: rename to versions
          promises.push(
            (async () => {
              const content = await entry.async('string');
              try {
                const data = JSON.parse(content);
                let table = data?.table as TableName | undefined;
                // _version.json files contain a single version row with table='versions'
                if (!table && baseName === '_version.json') table = 'versions';
                if (!table) {
                  // Try to infer from filename
                  const inferred = baseName.replace('.json', '') as TableName;
                  if (ALL_TABLES.includes(inferred)) table = inferred;
                }
                if (!table || !ALL_TABLES.includes(table)) return;
                if (!Array.isArray(data?.rows)) return;
                collected.push({ table, rows: data.rows });
              } catch {
                // ignore invalid json
              }
            })()
          );
        });
        await Promise.all(promises);

        if (collected.length === 0) throw new Error('الملف المضغوط لا يحتوي على بيانات معروفة');
      } else if (file.name.endsWith('.json')) {
        const content = await file.text();
        const data = JSON.parse(content);
        const table = data?.table as TableName;
        if (!table || !ALL_TABLES.includes(table)) {
          throw new Error('ملف JSON غير صالح: حقل table مفقود أو غير معروف');
        }
        if (!Array.isArray(data?.rows)) {
          throw new Error('ملف JSON غير صالح: حقل rows مفقود');
        }
        collected.push({ table, rows: data.rows });
      } else {
        throw new Error('يجب اختيار ملف .zip أو .json');
      }

      // Merge rows of the same table (deduplicate by id)
      const merged = new Map<TableName, Map<string, any>>();
      for (const { table, rows } of collected) {
        if (!merged.has(table)) merged.set(table, new Map());
        const m = merged.get(table)!;
        for (const r of rows) {
          const key = r.id ?? `${m.size}_${Math.random()}`;
          m.set(key, r);
        }
      }
      const finalList: { table: TableName; rows: any[] }[] = [];
      for (const [table, m] of merged) {
        finalList.push({ table, rows: Array.from(m.values()) });
      }

      setPendingRestore(finalList);
      setRestoreDialogOpen(true);
    } catch (err: any) {
      toast.error('فشل في قراءة الملف: ' + err.message);
    }
  };

  const performRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      // Order by RESTORE_ORDER (parents first)
      const ordered = [...pendingRestore].sort(
        (a, b) => RESTORE_ORDER.indexOf(a.table) - RESTORE_ORDER.indexOf(b.table)
      );

      // Determine which version_ids are involved (for partial-version restores)
      const versionIdsInRestore = new Set<string>();
      for (const { table, rows } of ordered) {
        if (VERSIONED_TABLES.includes(table as VersionedTable)) {
          for (const r of rows) if (r.version_id) versionIdsInRestore.add(r.version_id);
        }
        if (table === 'versions') {
          for (const r of rows) if (r.id) versionIdsInRestore.add(r.id);
        }
      }

      // Delete + insert per table
      for (const { table, rows } of ordered) {
        const isVersioned = VERSIONED_TABLES.includes(table as VersionedTable);

        // For versioned tables, only delete rows belonging to the versions we're restoring
        // (so a single-version restore doesn't wipe other versions).
        if (isVersioned && versionIdsInRestore.size > 0) {
          const ids = Array.from(versionIdsInRestore);
          const { error: deleteError } = await (supabase as any)
            .from(table)
            .delete()
            .in('version_id', ids);
          if (deleteError) throw new Error(`فشل حذف بيانات ${table}: ${deleteError.message}`);
        } else if (table === 'versions' && versionIdsInRestore.size > 0) {
          // Only delete the versions being restored, NOT all versions
          const ids = Array.from(versionIdsInRestore);
          const { error: deleteError } = await (supabase as any)
            .from(table)
            .delete()
            .in('id', ids);
          if (deleteError) throw new Error(`فشل حذف بيانات ${table}: ${deleteError.message}`);
        } else {
          // Global tables (if any remain): full wipe
          const { error: deleteError } = await (supabase as any)
            .from(table)
            .delete()
            .not('id', 'is', null);
          if (deleteError) throw new Error(`فشل حذف بيانات ${table}: ${deleteError.message}`);
        }

        if (rows.length === 0) continue;

        const batchSize = 200;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error: insertError } = await (supabase as any).from(table).insert(batch);
          if (insertError) throw new Error(`فشل استعادة ${table} (دفعة ${i}): ${insertError.message}`);
        }
      }

      toast.success('تمت استعادة البيانات بنجاح');
      setRestoreDialogOpen(false);
      setPendingRestore(null);
      await loadVersions();
    } catch (err: any) {
      toast.error(err.message || 'فشلت عملية الاستعادة');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold gradient-text mb-2">النسخ الاحتياطي والاستعادة</h1>
        <p className="text-muted-foreground">
          نزّل نسخة احتياطية كاملة منظّمة بمجلدات لكل نسخة على حدة، أو نزّل بيانات نسخة واحدة فقط. يمكنك أيضًا استعادة البيانات من ملف نسخة احتياطية.
        </p>
      </div>

      {/* Full backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-primary" />
            نسخة احتياطية كاملة
          </CardTitle>
          <CardDescription>
            ملف ZIP يحتوي على مجلد <Badge variant="outline">global</Badge> للبيانات العامة، ومجلد لكل نسخة داخل <Badge variant="outline">versions/</Badge> فيه كل بياناتها (منتجات، عملاء، طلبات...).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadFullBackup} disabled={loading} size="lg" className="gap-2">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            تنزيل النسخة الكاملة (.zip)
          </Button>
        </CardContent>
      </Card>

      {/* Per-version backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                تنزيل نسخة واحدة
              </CardTitle>
              <CardDescription>اختر نسخة محددة لتنزيل كل بياناتها وحدها في ملف ZIP.</CardDescription>
            </div>
            <Button variant="outline" onClick={loadVersions} disabled={versionsLoading}>
              {versionsLoading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              {versionsList.length > 0 ? 'تحديث القائمة' : 'عرض النسخ'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versionsList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              اضغط "عرض النسخ" لتحميل قائمة النسخ المتاحة
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {versionsList.map((v) => {
                  const isLoading = downloadingVersion === v.id;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 border border-border rounded-xl bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Database className="h-4 w-4 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {v.name}
                            {v.is_active && <Badge variant="secondary" className="text-xs">نشطة</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {new Date(v.created_at).toLocaleDateString('ar-EG')}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadSingleVersionBackup(v)}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Global tables download */}
              <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileJson className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium">البيانات العامة</div>
                    <div className="text-xs text-muted-foreground">
                      إعدادات التطبيق، الموظفين، قائمة النسخ
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={downloadGlobalBackup}
                  disabled={downloadingVersion === '__global__'}
                >
                  {downloadingVersion === '__global__' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Upload className="h-5 w-5" />
            استعادة من نسخة احتياطية
          </CardTitle>
          <CardDescription>
            ارفع <Badge variant="outline">.zip</Badge> كامل أو نسخة واحدة، أو ملف{' '}
            <Badge variant="outline">.json</Badge> لاستعادة جدول واحد. سيتم استبدال البيانات الحالية للجداول/النسخ المضمّنة فقط.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="destructive"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
            size="lg"
          >
            <Upload className="h-5 w-5" />
            اختيار ملف للاستعادة
          </Button>
        </CardContent>
      </Card>

      {/* Confirm restore dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              تأكيد الاستعادة
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  سيتم <strong>حذف البيانات الحالية</strong> للجداول التالية واستبدالها بمحتوى الملف. هذا الإجراء لا يمكن التراجع عنه.
                </p>
                {pendingRestore && (
                  <div className="bg-muted rounded-lg p-3 space-y-1 max-h-60 overflow-y-auto">
                    {pendingRestore.map((f) => (
                      <div key={f.table} className="flex justify-between text-sm">
                        <span className="font-medium">{TABLE_LABELS[f.table]}</span>
                        <span className="text-muted-foreground">{f.rows.length} سجل</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  نصيحة: قم بتنزيل نسخة احتياطية كاملة قبل المتابعة.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                performRestore();
              }}
              disabled={restoring}
              className="bg-destructive hover:bg-destructive/90"
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري الاستعادة...
                </>
              ) : (
                'تأكيد الاستعادة'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Backup;
