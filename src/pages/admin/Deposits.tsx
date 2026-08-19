import { useEffect, useState } from 'react';
import { Wallet, Download, Calendar, Plus, Minus, Trash2, Filter, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useVersion } from '@/contexts/VersionContext';

interface Deposit {
  id: string;
  order_number: number;
  customer_name: string;
  amount: number;
  method: string;
  branch?: string | null;
  created_at: string;
}

interface Expense {
  id: string;
  amount: number;
  description: string;
  expense_date: string;
  created_at: string;
}

interface DayDeposits {
  date: string;
  dateKey: string;
  cash: Deposit[];
  instapay: Deposit[];
  vodafone_cash: Deposit[];
  expenses: Expense[];
  totalCash: number;
  totalInstapay: number;
  totalVodafone: number;
  totalExpenses: number;
}

const methodLabels: Record<string, string> = {
  cash: 'كاش',
  instapay: 'InstaPay',
  vodafone_cash: 'فودافون كاش',
};

const Deposits = () => {
  const { activeVersion } = useVersion();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');

  useEffect(() => {
    if (activeVersion) {
      loadData();

      // Real-time subscription for deposits changes
      const depositsChannel = supabase
        .channel('deposits-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, () => {
          loadData();
        })
        .subscribe();

      // Real-time subscription for expenses changes
      const expensesChannel = supabase
        .channel('expenses-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
          loadData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(depositsChannel);
        supabase.removeChannel(expensesChannel);
      };
    }
  }, [activeVersion]);

  const getDepositBranch = (d: any): string | null => {
    if (d.branch) return d.branch;
    if (d.orders?.branch) return d.orders.branch;
    const extra = d.orders?.extra_info || d.extra_info || '';
    if (extra.includes('نيلي')) return 'نيلي';
    if (extra.includes('العبور')) return 'العبور';
    return null;
  };

  const loadData = async () => {
    if (!activeVersion) return;
    setLoading(true);
    
    const [depositsResult, expensesResult] = await Promise.all([
      supabase.from('deposits').select('*, orders(extra_info, branch)').eq('version_id', activeVersion.id).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*').eq('version_id', activeVersion.id).order('created_at', { ascending: false }),
    ]);

    if (depositsResult.error) {
      toast.error('فشل في تحميل العربون');
    } else {
      setDeposits(depositsResult.data || []);
    }

    if (expensesResult.error) {
      toast.error('فشل في تحميل المصروفات');
    } else {
      setExpenses(expensesResult.data || []);
    }
    
    setLoading(false);
  };

  // Apply filters
  const filteredDeposits = deposits.filter((d: any) => {
    const dateObj = new Date(d.created_at);
    const dateKey = dateObj.toISOString().split('T')[0];
    if (filterDate && dateKey !== format(filterDate, 'yyyy-MM-dd')) return false;
    if (filterMethod !== 'all' && d.method !== filterMethod) return false;
    const depositBranch = getDepositBranch(d);
    if (filterBranch !== 'all' && depositBranch !== filterBranch) return false;
    return true;
  });

  const filteredExpenses = expenses.filter((e) => {
    if (filterDate && e.expense_date !== format(filterDate, 'yyyy-MM-dd')) return false;
    return true;
  });

  // Group deposits by day
  const groupedByDay = filteredDeposits.reduce<Record<string, DayDeposits>>((acc, deposit) => {
    const dateObj = new Date(deposit.created_at);
    const dateKey = dateObj.toISOString().split('T')[0];
    const date = dateObj.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

    if (!acc[dateKey]) {
      acc[dateKey] = {
        date,
        dateKey,
        cash: [],
        instapay: [],
        vodafone_cash: [],
        expenses: [],
        totalCash: 0,
        totalInstapay: 0,
        totalVodafone: 0,
        totalExpenses: 0,
      };
    }

    if (deposit.method === 'cash') {
      acc[dateKey].cash.push(deposit);
      acc[dateKey].totalCash += deposit.amount;
    } else if (deposit.method === 'instapay') {
      acc[dateKey].instapay.push(deposit);
      acc[dateKey].totalInstapay += deposit.amount;
    } else if (deposit.method === 'vodafone_cash') {
      acc[dateKey].vodafone_cash.push(deposit);
      acc[dateKey].totalVodafone += deposit.amount;
    }

    return acc;
  }, {});

  // Add expenses to the grouped data
  filteredExpenses.forEach((expense) => {
    const dateKey = expense.expense_date;
    if (groupedByDay[dateKey]) {
      groupedByDay[dateKey].expenses.push(expense);
      groupedByDay[dateKey].totalExpenses += expense.amount;
    } else {
      const dateObj = new Date(expense.expense_date);
      const date = dateObj.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      });
      groupedByDay[dateKey] = {
        date,
        dateKey,
        cash: [],
        instapay: [],
        vodafone_cash: [],
        expenses: [expense],
        totalCash: 0,
        totalInstapay: 0,
        totalVodafone: 0,
        totalExpenses: expense.amount,
      };
    }
  });

  const dayGroups = Object.values(groupedByDay).sort((a, b) => 
    new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime()
  );

  const totalDeposits = filteredDeposits.reduce((sum, d) => sum + d.amount, 0);
  const totalExpensesAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleAddExpense = async () => {
    if (!activeVersion) return;
    if (!expenseAmount || !expenseDescription || !selectedDate) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    const { error } = await supabase.from('expenses').insert({
      amount,
      description: expenseDescription,
      expense_date: selectedDate,
      version_id: activeVersion.id,
    });

    if (error) {
      toast.error('فشل في إضافة المصروف');
    } else {
      toast.success('تم إضافة المصروف بنجاح');
      setExpenseDialogOpen(false);
      setExpenseAmount('');
      setExpenseDescription('');
      setSelectedDate('');
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) {
      toast.error('فشل في حذف المصروف');
    } else {
      toast.success('تم حذف المصروف');
    }
  };

  const exportToExcel = () => {
    const headers = ['رقم الطلب', 'اسم العميل', 'الفرع', 'المبلغ', 'طريقة الدفع', 'التاريخ والوقت'];
    const rows = deposits.map((d) => [
      d.order_number,
      d.customer_name,
      d.branch || '-',
      d.amount,
      methodLabels[d.method] || d.method,
      new Date(d.created_at).toLocaleString('ar-EG'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'deposits.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderMethodTable = (deposits: Deposit[], methodName: string, total: number, colorClass: string, netCash?: number) => {
    if (deposits.length === 0 && netCash === undefined) return null;

    return (
      <div className="mb-4">
        <div className={`px-4 py-2 rounded-t-lg font-bold ${colorClass}`}>
          {methodName} - الإجمالي: {total.toFixed(2)} ج.م
          {netCash !== undefined && netCash !== total && (
            <span className="mr-4 text-sm">
              (الصافي بعد المصروفات: {netCash.toFixed(2)} ج.م)
            </span>
          )}
        </div>
        <div className="border border-t-0 rounded-b-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-right">رقم الطلب</th>
                <th className="p-2 text-right">العميل</th>
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-right">المبلغ</th>
                <th className="p-2 text-right">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((deposit) => (
                <tr key={deposit.id} className="border-t hover:bg-muted/50">
                  <td className="p-2 font-bold text-primary">#{deposit.order_number}</td>
                  <td className="p-2">{deposit.customer_name}</td>
                  <td className="p-2">
                    {(() => {
                      const b = getDepositBranch(deposit);
                      return b ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-semibold",
                          b === 'نيلي' ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        )}>
                          {b}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      );
                    })()}
                  </td>
                  <td className="p-2 font-bold">{deposit.amount.toFixed(2)} ج.م</td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(deposit.created_at).toLocaleTimeString('ar-EG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderExpensesTable = (dayExpenses: Expense[], dateKey: string) => {
    return (
      <div className="mb-4">
        <div className="px-4 py-2 rounded-t-lg font-bold bg-orange-100 text-orange-800 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Minus className="h-4 w-4" />
            المصروفات - الإجمالي: {dayExpenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)} ج.م
          </span>
          <Dialog open={expenseDialogOpen && selectedDate === dateKey} onOpenChange={(open) => {
            setExpenseDialogOpen(open);
            if (open) setSelectedDate(dateKey);
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-orange-800 hover:bg-orange-200">
                <Plus className="h-4 w-4" />
                إضافة مصروف
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إضافة مصروف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>المبلغ</Label>
                  <Input
                    type="number"
                    placeholder="أدخل المبلغ"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Input
                    placeholder="وصف المصروف"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddExpense} className="w-full">
                  إضافة المصروف
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {dayExpenses.length > 0 && (
          <div className="border border-t-0 rounded-b-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">الوصف</th>
                  <th className="p-2 text-right">المبلغ</th>
                  <th className="p-2 text-right">الوقت</th>
                  <th className="p-2 text-right">حذف</th>
                </tr>
              </thead>
              <tbody>
                {dayExpenses.map((expense) => (
                  <tr key={expense.id} className="border-t hover:bg-muted/50">
                    <td className="p-2">{expense.description}</td>
                    <td className="p-2 font-bold text-orange-600">-{expense.amount.toFixed(2)} ج.م</td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(expense.created_at).toLocaleTimeString('ar-EG')}
                    </td>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteExpense(expense.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dayExpenses.length === 0 && (
          <div className="border border-t-0 rounded-b-lg p-4 text-center text-muted-foreground">
            لا توجد مصروفات
          </div>
        )}
      </div>
    );
  };

  if (!activeVersion) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">سجل العربون</h1>
        {deposits.length > 0 && (
          <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <Download className="h-4 w-4" />
            تصدير Excel
          </Button>
        )}
      </div>

      {/* Branch Selection Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-muted/60 rounded-2xl w-fit border">
        <Button
          size="sm"
          variant={filterBranch === 'all' ? 'default' : 'ghost'}
          onClick={() => setFilterBranch('all')}
          className={cn("rounded-xl font-bold gap-1.5 px-4", filterBranch === 'all' && "shadow-sm")}
        >
          <Building2 className="h-4 w-4" />
          جميع الفروع
        </Button>
        <Button
          size="sm"
          variant={filterBranch === 'نيلي' ? 'default' : 'ghost'}
          onClick={() => setFilterBranch('نيلي')}
          className={cn("rounded-xl font-bold gap-1.5 px-4", filterBranch === 'نيلي' && "bg-blue-600 hover:bg-blue-700 text-white shadow-sm")}
        >
          <Building2 className="h-4 w-4" />
          فرع نيلي
        </Button>
        <Button
          size="sm"
          variant={filterBranch === 'العبور' ? 'default' : 'ghost'}
          onClick={() => setFilterBranch('العبور')}
          className={cn("rounded-xl font-bold gap-1.5 px-4", filterBranch === 'العبور' && "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm")}
        >
          <Building2 className="h-4 w-4" />
          فرع العبور
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("gap-2", filterDate && "border-primary text-primary")}>
              <Calendar className="h-4 w-4" />
              {filterDate ? format(filterDate, 'yyyy-MM-dd') : 'اختر اليوم'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={filterDate}
              onSelect={setFilterDate}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <div className="flex gap-2">
          {[
            { key: 'all', label: 'الكل' },
            { key: 'cash', label: 'كاش' },
            { key: 'instapay', label: 'InstaPay' },
            { key: 'vodafone_cash', label: 'فودافون كاش' },
          ].map((m) => (
            <Button
              key={m.key}
              size="sm"
              variant={filterMethod === m.key ? 'default' : 'outline'}
              onClick={() => setFilterMethod(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {(filterDate || filterMethod !== 'all' || filterBranch !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterDate(undefined); setFilterMethod('all'); setFilterBranch('all'); }}>
            مسح الفلاتر
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي العربون</p>
                <p className="text-3xl font-bold text-primary">{totalDeposits.toFixed(2)} ج.م</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Wallet className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
                <p className="text-3xl font-bold text-orange-600">{totalExpensesAmount.toFixed(2)} ج.م</p>
              </div>
              <div className="p-3 rounded-xl bg-orange-100 text-orange-600">
                <Minus className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">عدد المعاملات</p>
                <p className="text-3xl font-bold">{deposits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : dayGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا توجد معاملات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {dayGroups.map((day) => {
            const netCash = day.totalCash - day.totalExpenses;
            return (
              <Card key={day.dateKey}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                    {day.date}
                    <span className="text-sm font-normal text-muted-foreground mr-auto">
                      إجمالي اليوم: {(day.totalCash + day.totalInstapay + day.totalVodafone).toFixed(2)} ج.م
                      {day.totalExpenses > 0 && (
                        <span className="text-orange-600 mr-2">
                          | الصافي: {(day.totalCash + day.totalInstapay + day.totalVodafone - day.totalExpenses).toFixed(2)} ج.م
                        </span>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(filterMethod === 'all' || filterMethod === 'cash') && renderMethodTable(day.cash, 'كاش', day.totalCash, 'bg-green-100 text-green-800', netCash)}
                  {(filterMethod === 'all' || filterMethod === 'instapay') && renderMethodTable(day.instapay, 'InstaPay', day.totalInstapay, 'bg-blue-100 text-blue-800')}
                  {(filterMethod === 'all' || filterMethod === 'vodafone_cash') && renderMethodTable(day.vodafone_cash, 'فودافون كاش', day.totalVodafone, 'bg-red-100 text-red-800')}
                  {filterMethod === 'all' && renderExpensesTable(day.expenses, day.dateKey)}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Deposits;
