import { useEffect, useState } from 'react';
import { useNavigate, Link, Outlet, useLocation } from 'react-router-dom';
import { Package, ShoppingCart, Users, BarChart3, LogOut, Wallet, SearchCode, FileText, ImagePlus, Menu, X, Bell, UserCog, ClipboardList, Settings, ListChecks, Truck, DatabaseBackup, Undo2, SlidersHorizontal, TrendingUp, Receipt, Sparkles, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import babylandLogo from '@/assets/babyland-logo.jpg';
import { VersionProvider } from '@/contexts/VersionContext';
import VersionSelector from '@/components/VersionSelector';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { maybeAutoDownloadBackup } from '@/lib/autoBackup';
import { AiHighlightWatcher } from '@/components/AiHighlightWatcher';

// Each nav item has a permission key
const allNavItems = [
  { path: '/admin/dashboard', label: 'الإحصائيات', icon: BarChart3, permission: 'stats' },
  { path: '/admin/dashboard/products', label: 'المنتجات', icon: Package, permission: 'products' },
  { path: '/admin/dashboard/orders', label: 'الطلبات', icon: ShoppingCart, permission: 'orders' },
  { path: '/admin/dashboard/delivery-readiness', label: 'جاهزية التسليم', icon: PackageCheck, permission: 'delivery_readiness' },
  { path: '/admin/dashboard/orders-progress', label: 'تقدم الطلبات', icon: ListChecks, permission: 'orders_progress' },
  { path: '/admin/dashboard/shipping-details', label: 'تفاصيل الشحن', icon: Truck, permission: 'shipping_details' },
  { path: '/admin/dashboard/orders-return', label: 'مرتجعات الطلبات', icon: Undo2, permission: 'orders_return' },
  { path: '/admin/dashboard/customers', label: 'العملاء', icon: Users, permission: 'customers' },
  { path: '/admin/dashboard/deposits', label: 'العربون', icon: Wallet, permission: 'deposits' },
  { path: '/admin/dashboard/search-by-code', label: 'البحث بالكود', icon: SearchCode, permission: 'search' },
  { path: '/admin/dashboard/customer-extra-info', label: 'معلومات إضافية', icon: FileText, permission: 'extra_info' },
  { path: '/admin/dashboard/product-images', label: 'صور المنتجات', icon: ImagePlus, permission: 'images' },
  { path: '/admin/dashboard/stock-alerts', label: 'تنبيهات المخزون', icon: Bell, permission: 'stock_alerts' },
  { path: '/admin/dashboard/product-report', label: 'تقرير المنتجات', icon: ClipboardList, permission: 'product_report' },
  { path: '/admin/dashboard/staff', label: 'الموظفين', icon: UserCog, permission: 'staff' },
  { path: '/admin/dashboard/sales-control', label: 'التحكم في البيع', icon: SlidersHorizontal, permission: 'sales_control' },
  { path: '/admin/dashboard/daily-sales', label: 'المبيعات اليومية', icon: TrendingUp, permission: 'daily_sales' },
  { path: '/admin/dashboard/product-prices', label: 'أسعار المنتجات', icon: Receipt, permission: 'product_prices' },
  { path: '/admin/dashboard/backup', label: 'النسخ الاحتياطي', icon: DatabaseBackup, permission: 'backup' },
  { path: '/admin/dashboard/ai-assistant', label: '✨ المساعد الذكي', icon: Sparkles, permission: 'ai_assistant' },
];

export const PERMISSION_LABELS: Record<string, string> = {
  stats: 'الإحصائيات',
  products: 'المنتجات',
  orders: 'الطلبات',
  delivery_readiness: 'جاهزية التسليم',
  orders_progress: 'تقدم الطلبات',
  shipping_details: 'تفاصيل الشحن',
  orders_return: 'مرتجعات الطلبات',
  customers: 'العملاء',
  deposits: 'العربون',
  search: 'البحث بالكود',
  extra_info: 'معلومات إضافية',
  images: 'صور المنتجات',
  stock_alerts: 'تنبيهات المخزون',
  product_report: 'تقرير المنتجات',
  staff: 'الموظفين',
  sales_control: 'التحكم في البيع',
  daily_sales: 'المبيعات اليومية',
  product_prices: 'أسعار المنتجات',
  backup: 'النسخ الاحتياطي',
  ai_assistant: 'المساعد الذكي',
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuth, setIsAuth] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullAdmin, setIsFullAdmin] = useState(false);
  const [navItems, setNavItems] = useState(allNavItems);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  useEffect(() => {
    const auth = sessionStorage.getItem('babyland_admin');
    if (!auth) {
      navigate('/admin');
      return;
    }

    if (auth === 'true') {
      // Full admin
      setIsFullAdmin(true);
      setNavItems(allNavItems);
    } else if (auth === 'staff') {
      // Staff with permissions
      const staffData = sessionStorage.getItem('babyland_staff');
      if (staffData) {
        const staff = JSON.parse(staffData);
        const permissions: string[] = staff.permissions || [];
        const filtered = allNavItems.filter(item => permissions.includes(item.permission));
        setNavItems(filtered);
      }
    }

    setIsAuth(true);
    maybeAutoDownloadBackup();
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('babyland_admin');
    sessionStorage.removeItem('babyland_staff');
    navigate('/admin');
  };

  if (!isAuth) return null;

  return (
    <VersionProvider>
      <div className="min-h-screen bg-background flex">
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 right-3 z-50 lg:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`
          fixed lg:sticky top-0 h-screen z-40
          bg-card border-l border-border flex flex-col
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 translate-x-full lg:w-16 lg:translate-x-0'}
          overflow-hidden
        `}>
          <div className="p-4 border-b border-border min-w-[256px] lg:min-w-0">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3">
                <img src={babylandLogo} alt="Babyland" className="h-10 w-10 rounded-full flex-shrink-0" />
                {sidebarOpen && <span className="font-bold gradient-text whitespace-nowrap">لوحة التحكم</span>}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex flex-shrink-0"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {sidebarOpen && <VersionSelector />}
          
          <nav className="flex-1 p-4 space-y-2 min-w-[256px] lg:min-w-0 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-baby'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-border min-w-[256px] lg:min-w-0 space-y-2">
            {isFullAdmin && (
              <Button
                variant="ghost"
                onClick={() => setShowPasswordDialog(true)}
                className={`w-full gap-3 ${sidebarOpen ? 'justify-start' : 'justify-center'}`}
                title={!sidebarOpen ? 'تغيير كلمة المرور' : undefined}
              >
                <Settings className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span>تغيير كلمة المرور</span>}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={`w-full gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 ${sidebarOpen ? 'justify-start' : 'justify-center'}`}
              title={!sidebarOpen ? 'تسجيل الخروج' : undefined}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {sidebarOpen && <span>تسجيل الخروج</span>}
            </Button>
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <AiHighlightWatcher />
          <Outlet />
        </main>

        {isFullAdmin && (
          <ChangePasswordDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog} />
        )}
      </div>
    </VersionProvider>
  );
};

export default AdminDashboard;
