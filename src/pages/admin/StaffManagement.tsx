import { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Eye, EyeOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ALL_PERMISSIONS, PERMISSION_LABELS } from '@/pages/AdminDashboard';
import { useVersion } from '@/contexts/VersionContext';

interface StaffMember {
  id: string;
  name: string;
  password: string;
  is_active: boolean;
  created_at: string;
  permissions: string[];
}

const StaffManagement = () => {
  const { activeVersion } = useVersion();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editingPermissions, setEditingPermissions] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (activeVersion) {
      loadStaff();
    }
  }, [activeVersion]);

  const loadStaff = async () => {
    if (!activeVersion) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('version_id', activeVersion.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading staff members:', error);
      toast.error('فشل في تحميل الموظفين');
    } else {
      setStaff((data as unknown as StaffMember[]) || []);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('أدخل اسم الموظف');
      return;
    }
    if (!/^\d{4}$/.test(newPassword)) {
      toast.error('كلمة المرور يجب أن تكون 4 أرقام');
      return;
    }

    if (!activeVersion) {
      toast.error('لم يتم تحديد النسخة الحالية');
      return;
    }

    const { error } = await supabase.from('staff_members').insert({
      name: newName.trim(),
      password: newPassword,
      permissions: newPermissions,
      version_id: activeVersion.id,
    });

    if (error) {
      console.error('Error creating staff member:', error);
      toast.error(`فشل في إنشاء الحساب: ${error.message || ''}`);
    } else {
      toast.success('تم إنشاء حساب الموظف');
      setDialogOpen(false);
      setNewName('');
      setNewPassword('');
      setNewPermissions([]);
      loadStaff();
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('staff_members')
      .update({ is_active: !currentActive })
      .eq('id', id);

    if (error) {
      toast.error('فشل في تحديث الحالة');
    } else {
      loadStaff();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    const { error } = await supabase.from('staff_members').delete().eq('id', id);
    if (error) {
      toast.error('فشل في الحذف');
    } else {
      toast.success('تم الحذف');
      loadStaff();
    }
  };

  const handleSavePermissions = async (id: string) => {
    const { error } = await supabase
      .from('staff_members')
      .update({ permissions: editPermissions } as any)
      .eq('id', id);

    if (error) {
      toast.error('فشل في تحديث الصلاحيات');
    } else {
      toast.success('تم تحديث الصلاحيات');
      setEditingPermissions(null);
      loadStaff();
    }
  };

  const togglePermission = (perm: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(perm) ? list.filter(p => p !== perm) : [...list, perm]);
  };

  const PermissionChecklist = ({ permissions, onChange }: { permissions: string[]; onChange: (p: string[]) => void }) => (
    <div className="grid grid-cols-2 gap-2">
      {ALL_PERMISSIONS.map(perm => (
        <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-muted">
          <Checkbox
            checked={permissions.includes(perm)}
            onCheckedChange={() => togglePermission(perm, permissions, onChange)}
          />
          {PERMISSION_LABELS[perm]}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          إدارة الموظفين
        </h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          إضافة موظف
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : staff.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا يوجد موظفين</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {staff.map((member) => (
            <Card key={member.id} className="hover:shadow-baby transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{member.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground">كلمة المرور:</span>
                        <span className="font-mono text-sm" dir="ltr">
                          {showPasswords[member.id] ? member.password : '••••'}
                        </span>
                        <button
                          onClick={() => setShowPasswords(prev => ({ ...prev, [member.id]: !prev[member.id] }))}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {showPasswords[member.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                      {member.permissions && member.permissions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.permissions.map(p => (
                            <Badge key={p} variant="secondary" className="text-xs">
                              {PERMISSION_LABELS[p] || p}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(member.created_at).toLocaleDateString('ar-EG')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPermissions(member.id);
                        setEditPermissions(member.permissions || []);
                      }}
                    >
                      <Shield className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={member.is_active}
                        onCheckedChange={() => handleToggleActive(member.id, member.is_active)}
                      />
                      <Badge className={member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {member.is_active ? 'نشط' : 'معطل'}
                      </Badge>
                    </div>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDelete(member.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Inline permissions editor */}
                {editingPermissions === member.id && (
                  <div className="mt-4 p-3 border rounded-lg bg-muted/50">
                    <p className="font-medium mb-2 text-sm">صلاحيات لوحة التحكم:</p>
                    <PermissionChecklist permissions={editPermissions} onChange={setEditPermissions} />
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => handleSavePermissions(member.id)}>حفظ</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingPermissions(null)}>إلغاء</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Staff Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة موظف جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الموظف</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="أدخل اسم الموظف"
              />
            </div>
            <div>
              <Label>كلمة المرور (4 أرقام)</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={newPassword}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewPassword(val);
                }}
                placeholder="مثال: 1234"
                dir="ltr"
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4" />
                صلاحيات لوحة التحكم (اختياري)
              </Label>
              <PermissionChecklist permissions={newPermissions} onChange={setNewPermissions} />
            </div>
            <Button onClick={handleCreate} className="w-full" disabled={!newName.trim() || newPassword.length !== 4}>
              إنشاء الحساب
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffManagement;
