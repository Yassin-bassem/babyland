import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import babylandLogo from '@/assets/babyland-logo.jpg';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<'admin' | 'staff'>('admin');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Resolve active version ID
    let activeVersionId = import.meta.env.VITE_ACTIVE_VERSION_ID || localStorage.getItem('babyland_active_version_id');
    if (!activeVersionId) {
      const { data: defaultVersions } = await supabase
        .from('versions')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1);
      if (defaultVersions && defaultVersions.length > 0) {
        activeVersionId = defaultVersions[0].id;
        localStorage.setItem('babyland_active_version_id', activeVersionId);
      }
    }

    if (loginMode === 'admin') {
      // Fetch admin password from DB for the active version, fallback to global if missing
      let data: { value: string } | null = null;
      if (activeVersionId) {
        const { data: verSetting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'admin_password')
          .eq('version_id', activeVersionId)
          .maybeSingle();
        data = verSetting;
      }

      if (!data) {
        const { data: globalSetting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'admin_password')
          .limit(1)
          .maybeSingle();
        data = globalSetting;
      }

      setLoading(false);

      const expectedPassword = data?.value || 'admin';

      if (password === expectedPassword) {
        sessionStorage.setItem('babyland_admin', 'true');
        sessionStorage.removeItem('babyland_staff');
        toast.success('تم تسجيل الدخول بنجاح');
        navigate('/admin/dashboard');
      } else {
        toast.error('كلمة المرور غير صحيحة');
      }
    } else {
      // Staff login for the active version with fallback
      let staffData: any[] = [];
      if (activeVersionId) {
        const { data: verStaff } = await supabase
          .from('staff_members')
          .select('*')
          .eq('password', password)
          .eq('is_active', true)
          .eq('version_id', activeVersionId);
        staffData = verStaff || [];
      }

      if (staffData.length === 0) {
        const { data: globalStaff } = await supabase
          .from('staff_members')
          .select('*')
          .eq('password', password)
          .eq('is_active', true);
        staffData = globalStaff || [];
      }

      setLoading(false);

      if (staffData.length === 0) {
        toast.error('اسم المستخدم أو كلمة المرور غير صحيحة');
        return;
      }

      const staffMember = staffData[0];
      const permissions = (staffMember as any).permissions || [];
      
      if (permissions.length === 0) {
        // No admin permissions - go to store
        sessionStorage.setItem('babyland_staff', JSON.stringify({
          id: staffMember.id,
          name: staffMember.name,
        }));
        toast.success(`مرحباً ${staffMember.name}`);
        navigate('/');
      } else {
        // Has admin permissions - go to admin panel
        sessionStorage.setItem('babyland_staff', JSON.stringify({
          id: staffMember.id,
          name: staffMember.name,
          permissions,
        }));
        sessionStorage.setItem('babyland_admin', 'staff');
        toast.success(`مرحباً ${staffMember.name}`);
        navigate('/admin/dashboard');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-baby-blue-light via-background to-baby-pink-light p-4">
      <Card className="w-full max-w-md border-2 border-primary/20 shadow-baby-lg">
        <CardHeader className="text-center space-y-4">
          <img
            src={babylandLogo}
            alt="Babyland"
            className="w-24 h-24 mx-auto rounded-full shadow-baby float-animation"
          />
          <CardTitle className="text-2xl gradient-text">
            {loginMode === 'admin' ? 'لوحة التحكم' : 'تسجيل دخول الموظفين'}
          </CardTitle>
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              variant={loginMode === 'admin' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setLoginMode('admin'); setPassword(''); }}
            >
              <Lock className="h-4 w-4 ml-1" />
              أدمن
            </Button>
            <Button
              type="button"
              variant={loginMode === 'staff' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setLoginMode('staff'); setPassword(''); }}
            >
              <Users className="h-4 w-4 ml-1" />
              موظف
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                كلمة المرور {loginMode === 'staff' ? '(4 أرقام)' : ''}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    if (loginMode === 'staff') {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPassword(val);
                    } else {
                      setPassword(e.target.value);
                    }
                  }}
                  placeholder={loginMode === 'staff' ? 'أدخل الـ 4 أرقام' : 'أدخل كلمة المرور'}
                  className="pl-10"
                  dir="ltr"
                  inputMode={loginMode === 'staff' ? 'numeric' : undefined}
                  maxLength={loginMode === 'staff' ? 4 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-6 text-lg font-bold bg-gradient-to-l from-primary to-secondary"
            >
              {loading ? 'جاري الدخول...' : 'دخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
