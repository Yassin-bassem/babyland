import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Send, Download, Loader2, Sparkles, Trash2, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useVersion } from '@/contexts/VersionContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Msg = { role: 'user' | 'assistant'; content: string; actions?: any[] };

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const STORAGE_KEY = 'babyland_bibi_chat';

const SCHEMA_DOC = `
الجداول المتاحة وأسماء الأعمدة الحقيقية:

versions(id uuid, name text, is_active boolean, created_at timestamptz)
products(id uuid, code text, name text, description text, price numeric, image_url text, stock_quantity integer, low_stock_threshold integer, version_id uuid, created_at timestamptz)
customers(id uuid, name text, shop_name text, phone text, address text, is_new boolean, version_id uuid, created_at timestamptz)
orders(id uuid, order_number integer, customer_id uuid, customer_name text, shop_name text, phone text, address text, delivery_date date, shipping_company text, deposit_method text, deposit_amount numeric, subtotal numeric, total numeric, status text, progress_status text, staff_member_id uuid, staff_member_name text, extra_info text, version_id uuid, created_at timestamptz, updated_at timestamptz)
order_items(id uuid, order_id uuid, product_id uuid, product_code text, product_name text, product_description text, price numeric, quantity integer, fulfilled boolean, cancelled boolean, version_id uuid, created_at timestamptz)
order_returns(id uuid, customer_name text, shop_name text, phone text, address text, product_code text, product_name text, product_description text, quantity integer, unit_price numeric, total_amount numeric, notes text, version_id uuid, created_at timestamptz)
order_refunds(id uuid, order_id uuid, product_id uuid, product_code text, product_name text, product_description text, price numeric, quantity integer, version_id uuid, created_at timestamptz)
deposits(id uuid, order_id uuid, order_number integer, customer_name text, amount numeric, method text, version_id uuid, created_at timestamptz)
expenses(id uuid, amount numeric, description text, expense_date date, version_id uuid, created_at timestamptz)
shipping_details(id uuid, order_id uuid, order_number integer, customer_name text, phone text, address text, shipping_company text, tracking_number text, version_id uuid, created_at timestamptz)
stock_alerts(id uuid, product_id uuid, product_code text, product_name text, remaining_quantity integer, acknowledged boolean, acknowledged_at timestamptz, version_id uuid, created_at timestamptz)
staff_members(id uuid, name text, pin text, permissions text[], is_active boolean, created_at timestamptz)

قواعد مهمة:
- فلتر دايماً بـ version_id = '{ACTIVE_VERSION}' في products, customers, orders, order_items, returns, refunds, deposits, expenses, shipping_details, stock_alerts.
- متستخدمش أعمدة غير موجودة زي total_amount أو remaining_amount أو staff_name في orders. استخدم total، و subtotal، و staff_member_name، واحسب المتبقي: total - coalesce(deposit_amount,0).
- وصف المنتج ممكن يكون فيه multiplier زي "200/20". في التحليل بالقطع: quantity * الرقم بعد /.
- استخدم LIMIT واضح، وخلّي النتائج مختصرة.
`;

const ROUTES = `
الصفحات المتاحة (للتنقل):
- /admin/dashboard => الإحصائيات
- /admin/dashboard/products => المنتجات
- /admin/dashboard/orders => الطلبات
- /admin/dashboard/orders-progress => تقدم الطلبات
- /admin/dashboard/shipping-details => تفاصيل الشحن
- /admin/dashboard/orders-return => مرتجعات
- /admin/dashboard/customers => العملاء
- /admin/dashboard/deposits => العربون
- /admin/dashboard/search-by-code => البحث بالكود
- /admin/dashboard/stock-alerts => تنبيهات المخزون
- /admin/dashboard/product-report => تقرير المنتجات
- /admin/dashboard/daily-sales => المبيعات اليومية
- /admin/dashboard/product-prices => أسعار المنتجات
- /admin/dashboard/staff => الموظفين
- /admin/dashboard/backup => النسخ الاحتياطي
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_report",
      description: "يجلب تقارير جاهزة وسريعة من بيانات الموقع بدون كتابة SQL. استخدمه أولاً للأسئلة الشائعة والتقارير والإكسيل.",
      parameters: {
        type: "object",
        properties: {
          report: {
            type: "string",
            enum: [
              "today_orders",
              "sales_overview",
              "weekly_sales",
              "monthly_sales",
              "low_stock",
              "top_products",
              "top_customers",
              "deposits_summary",
              "open_orders",
              "invoice_export",
            ],
          },
          limit: { type: "number", description: "عدد الصفوف المطلوب، افتراضي 50" },
        },
        required: ["report"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_order",
      description: "يبحث عن طلب معين باستخدام رقم الطلب (order_number) أو اسم العميل أو اسم المحل أو رقم التليفون ويرجع تفاصيل الطلب كاملة مع المنتجات بتاعته.",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "number", description: "رقم الطلب (مثل 16)" },
          search_term: { type: "string", description: "رقم التليفون أو اسم العميل أو اسم المحل للبحث" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_sql",
      description: "ينفذ استعلام SELECT مخصص عند الحاجة فقط. استخدم get_report للأسئلة الشائعة. SELECT فقط ولازم تستخدم أسماء الأعمدة الحقيقية من schema.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "استعلام SELECT صحيح" },
          purpose: { type: "string", description: "ليه بتعمل الاستعلام ده باختصار" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "ينقل المستخدم لصفحة معينة في لوحة التحكم.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "المسار الكامل مثل /admin/dashboard/orders" },
          highlight: { type: "string", description: "نص أو رقم لتمييزه في الصفحة (اختياري)" },
          reason: { type: "string", description: "ليه بتنقله لهنا" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_excel",
      description: "يصدر ملف Excel من بيانات حقيقية. ممنوع منعاً باتاً تخترع صفوف. لازم تحدد إما report (تقرير جاهز) أو sql (SELECT). السيرفر هو اللي بيجيب الصفوف ويصدرها — مش انت.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "اسم الملف بدون امتداد أو بـ .xlsx" },
          title: { type: "string", description: "عنوان الشيت" },
          report: {
            type: "string",
            enum: [
              "today_orders",
              "sales_overview",
              "weekly_sales",
              "monthly_sales",
              "low_stock",
              "top_products",
              "top_customers",
              "deposits_summary",
              "open_orders",
              "invoice_export",
            ],
            description: "اسم تقرير جاهز يجلب بياناته السيرفر",
          },
          sql: { type: "string", description: "SELECT مخصص. للمدير الكامل فقط." },
          limit: { type: "number" },
        },
        required: ["filename"],
      },
    },
  },
];

const isSafeSql = (sql: string): boolean => {
  const s = sql.trim().toLowerCase();
  if (!s.startsWith("select") && !s.startsWith("with")) return false;
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|copy|call|do|execute)\b/;
  return !forbidden.test(s);
};

const toNumber = (value: unknown) => Number(value || 0);

const isFullAdmin = (permissions: string[] = []) => permissions.includes("all");

const canAccessReport = (report: string, permissions: string[] = []) => {
  if (isFullAdmin(permissions)) return true;
  const has = (keys: string[]) => keys.some((key) => permissions.includes(key));
  if (["sales_overview", "weekly_sales", "monthly_sales", "deposits_summary", "top_customers", "invoice_export"].includes(report)) return false;
  if (report === "today_orders" || report === "open_orders") return has(["orders", "orders_progress", "daily_sales"]);
  if (report === "low_stock") return has(["products", "stock_alerts"]);
  if (report === "top_products") return has(["product_report", "search", "products", "daily_sales"]);
  return false;
};

const sanitizeForPermissions = (report: string, result: any, permissions: string[] = []) => {
  if (isFullAdmin(permissions) || !result?.ok) return result;
  const stripMoney = (row: any) => {
    const { total, subtotal, price, deposit_amount, amount, deposits, sales, total_sales, total_amount, remaining_amount, ...safe } = row || {};
    return safe;
  };
  if (["today_orders", "open_orders", "top_products"].includes(report)) {
    return { ...result, rows: (result.rows || []).map(stripMoney), summary: { count: result.rows?.length || result.summary?.count || result.summary?.orders_count || 0 } };
  }
  return result;
};

const compactRows = (rows: any[] | null | undefined, limit = 50) => {
  return (rows || []).slice(0, Math.max(1, Math.min(limit, 200)));
};

const getReport = async (supabaseClient: any, report: string, activeVersionId: string, limit = 50) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const v = activeVersionId;
  if (!v) return { ok: false, error: "مفيش نسخة نشطة محددة" };

  if (report === "today_orders") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, shop_name, phone, total, deposit_amount, status, progress_status, staff_member_name, created_at")
      .eq("version_id", v)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) return { ok: false, error: error.message };
    const total = (data || []).reduce((sum: number, row: any) => sum + toNumber(row.total), 0);
    return { ok: true, rows: data || [], summary: { orders_count: data?.length || 0, total_sales: total } };
  }

  if (report === "sales_overview") {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, shop_name, phone, total, deposit_amount, status, staff_member_name, created_at")
      .eq("version_id", v)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) return { ok: false, error: error.message };
    const rows = compactRows(data || [], safeLimit).map((o: any) => ({ ...o, remaining_amount: toNumber(o.total) - toNumber(o.deposit_amount) }));
    return {
      ok: true,
      rows,
      summary: {
        orders_count: data?.length || 0,
        total_sales: (data || []).reduce((sum: number, row: any) => sum + toNumber(row.total), 0),
        total_deposits: (data || []).reduce((sum: number, row: any) => sum + toNumber(row.deposit_amount), 0),
      },
    };
  }

  if (report === "weekly_sales" || report === "monthly_sales") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (report === "weekly_sales" ? 6 : 29));
    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, shop_name, phone, total, deposit_amount, status, staff_member_name, created_at")
      .eq("version_id", v)
      .gte("created_at", start.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    const byDay = new Map<string, { date: string; orders: number; sales: number; deposits: number }>();
    for (const row of data || []) {
      const date = new Date(row.created_at).toLocaleDateString("ar-EG");
      const item = byDay.get(date) || { date, orders: 0, sales: 0, deposits: 0 };
      item.orders += 1;
      item.sales += toNumber(row.total);
      item.deposits += toNumber(row.deposit_amount);
      byDay.set(date, item);
    }
    const rows = Array.from(byDay.values());
    return {
      ok: true,
      rows: compactRows(rows, safeLimit),
      raw_orders: compactRows(data || [], safeLimit),
      summary: {
        orders_count: data?.length || 0,
        total_sales: (data || []).reduce((sum: number, row: any) => sum + toNumber(row.total), 0),
        total_deposits: (data || []).reduce((sum: number, row: any) => sum + toNumber(row.deposit_amount), 0),
      },
    };
  }

  if (report === "low_stock") {
    const { data, error } = await supabaseClient
      .from("products")
      .select("code, name, description, price, stock_quantity, low_stock_threshold")
      .eq("version_id", v)
      .order("stock_quantity", { ascending: true })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    const rows = (data || []).filter((p: any) => toNumber(p.stock_quantity) <= toNumber(p.low_stock_threshold || 5));
    return { ok: true, rows: compactRows(rows, safeLimit), summary: { products_count: rows.length } };
  }

  if (report === "top_products") {
    const { data, error } = await supabaseClient
      .from("order_items")
      .select("product_code, product_name, product_description, price, quantity, cancelled")
      .eq("version_id", v)
      .limit(5000);
    if (error) return { ok: false, error: error.message };
    const map = new Map<string, any>();
    for (const item of data || []) {
      if (item.cancelled) continue;
      const key = item.product_code || item.product_name;
      const current = map.get(key) || { product_code: item.product_code, product_name: item.product_name, quantity: 0, sales: 0 };
      current.quantity += toNumber(item.quantity);
      current.sales += toNumber(item.quantity) * toNumber(item.price);
      map.set(key, current);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
    return { ok: true, rows: compactRows(rows, safeLimit), summary: { products_count: rows.length } };
  }

  if (report === "top_customers") {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("customer_name, shop_name, phone, total, deposit_amount")
      .eq("version_id", v)
      .limit(5000);
    if (error) return { ok: false, error: error.message };
    const map = new Map<string, any>();
    for (const order of data || []) {
      const key = order.phone || `${order.customer_name}-${order.shop_name}`;
      const current = map.get(key) || { customer_name: order.customer_name, shop_name: order.shop_name, phone: order.phone, orders: 0, total_sales: 0, deposits: 0 };
      current.orders += 1;
      current.total_sales += toNumber(order.total);
      current.deposits += toNumber(order.deposit_amount);
      map.set(key, current);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.total_sales - a.total_sales);
    return { ok: true, rows: compactRows(rows, safeLimit), summary: { customers_count: rows.length } };
  }

  if (report === "deposits_summary") {
    const { data, error } = await supabaseClient
      .from("deposits")
      .select("order_number, customer_name, amount, method, created_at")
      .eq("version_id", v)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: compactRows(data || [], safeLimit), summary: { count: data?.length || 0, total: (data || []).reduce((sum: number, row: any) => sum + toNumber(row.amount), 0) } };
  }

  if (report === "open_orders") {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, shop_name, phone, total, deposit_amount, status, progress_status, delivery_date, created_at")
      .eq("version_id", v)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    const rows = (data || []).filter((o: any) => !["completed", "delivered", "cancelled"].includes(String(o.status || o.progress_status || "").toLowerCase()));
    return { ok: true, rows: compactRows(rows, safeLimit), summary: { count: rows.length, total_remaining: rows.reduce((sum: number, row: any) => sum + (toNumber(row.total) - toNumber(row.deposit_amount)), 0) } };
  }

  if (report === "invoice_export") {
    const { data, error } = await supabaseClient
      .from("orders")
      .select("order_number, customer_name, shop_name, phone, address, total, deposit_amount, deposit_method, status, staff_member_name, created_at")
      .eq("version_id", v)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) return { ok: false, error: error.message };
    const rows = (data || []).map((o: any) => ({ ...o, remaining_amount: toNumber(o.total) - toNumber(o.deposit_amount) }));
    return { ok: true, rows, summary: { invoices_count: rows.length, total_sales: rows.reduce((sum: number, row: any) => sum + toNumber(row.total), 0) } };
  }

  return { ok: false, error: "نوع التقرير مش معروف" };
};

const inferReport = (text: string): string | null => {
  const t = text.toLowerCase();
  if (/فواتير|فاتورة|invoice/.test(t)) return "invoice_export";
  if (/كل|كلي|كاملة|اجمالي|إجمالي|total/.test(t) && /مبيع|مبيعات|sales/.test(t)) return "sales_overview";
  if (/النهارده|النهاردة|اليوم|today/.test(t) && /طلب|اوردر|مبيع|sales/.test(t)) return "today_orders";
  if (/اسبوع|أسبوع|week/.test(t)) return "weekly_sales";
  if (/شهر|monthly|month/.test(t)) return "monthly_sales";
  if (/مخزون|خلص|تخلص|ناقص|قربت|low/.test(t)) return "low_stock";
  if (/اكتر|أكتر|أفضل|افضل|top/.test(t) && /منتج|كود|products?/.test(t)) return "top_products";
  if (/اكتر|أكتر|أفضل|افضل|top/.test(t) && /عميل|زبون|customers?/.test(t)) return "top_customers";
  if (/عربون|عربون|deposit|deposits/.test(t)) return "deposits_summary";
  if (/مفتوح|متأخر|لسه|open|pending/.test(t) && /طلب|اوردر/.test(t)) return "open_orders";
  return null;
};

const wantsExcel = (text: string): boolean => {
  return /اكسيل|إكسيل|excel|xlsx|شيت|sheet|ملف/.test(text.toLowerCase());
};

const filenameForReport = (report: string): string => {
  const names: Record<string, string> = {
    today_orders: "طلبات-النهاردة.xlsx",
    sales_overview: "ملخص-المبيعات-الكلي.xlsx",
    weekly_sales: "مبيعات-الأسبوع.xlsx",
    monthly_sales: "مبيعات-الشهر.xlsx",
    low_stock: "منتجات-قربت-تخلص.xlsx",
    top_products: "أكتر-المنتجات-مبيعاً.xlsx",
    top_customers: "أكتر-العملاء-شراء.xlsx",
    deposits_summary: "ملخص-العربون.xlsx",
    open_orders: "الطلبات-المفتوحة.xlsx",
    invoice_export: "ملخص-الفواتير.xlsx",
  };
  return names[report] || "تقرير-Babyland.xlsx";
};

const inferNavigation = (text: string): string | null => {
  const t = text.toLowerCase();
  if (/منتجات|products?/.test(t)) return "/admin/dashboard/products";
  if (/طلبات|اوردر|orders?/.test(t)) return "/admin/dashboard/orders";
  if (/عملاء|عميل|customers?/.test(t)) return "/admin/dashboard/customers";
  if (/عربون|deposits?/.test(t)) return "/admin/dashboard/deposits";
  if (/مخزون|تنبيه|خلص/.test(t)) return "/admin/dashboard/stock-alerts";
  if (/تقرير/.test(t)) return "/admin/dashboard/product-report";
  if (/مبيعات/.test(t)) return "/admin/dashboard/daily-sales";
  if (/نسخ|backup/.test(t)) return "/admin/dashboard/backup";
  return null;
};

const reportText = (report: string, result: any, exported: boolean): string => {
  const rows = result.rows || [];
  const summary = result.summary || {};
  const money = (n: unknown) => Math.round(toNumber(n)).toLocaleString("ar-EG");
  const suffix = exported ? " ونزلتلك ملف الإكسيل." : "";

  if (!rows.length) return exported ? "ملقتش بيانات للفترة دي، عشان كده مش هينفع أطلع شيت مفيد." : "ملقتش بيانات للفترة دي.";
  if (report === "today_orders") return `عندك ${summary.orders_count} طلب النهارده بإجمالي ${money(summary.total_sales)} جنيه${suffix}`;
  if (report === "sales_overview") return `إجمالي المبيعات ${summary.orders_count} طلب، بقيمة ${money(summary.total_sales)} جنيه، والعربون ${money(summary.total_deposits)} جنيه${suffix}`;
  if (report === "weekly_sales") return `مبيعات الأسبوع ${summary.orders_count} طلب، بإجمالي ${money(summary.total_sales)} جنيه، والعربون ${money(summary.total_deposits)} جنيه${suffix}`;
  if (report === "monthly_sales") return `مبيعات الشهر ${summary.orders_count} طلب، بإجمالي ${money(summary.total_sales)} جنيه، والعربون ${money(summary.total_deposits)} جنيه${suffix}`;
  if (report === "low_stock") return `عندك ${summary.products_count} منتج محتاج متابعة في المخزون. أقلهم ${rows[0]?.code || ""} - ${rows[0]?.name || ""}${suffix}`;
  if (report === "top_products") return `أكتر منتج متباع هو ${rows[0]?.product_code || ""} - ${rows[0]?.product_name || ""} بكمية ${rows[0]?.quantity || 0}${suffix}`;
  if (report === "top_customers") return `أكتر عميل شراء هو ${rows[0]?.customer_name || rows[0]?.shop_name || "عميل بدون اسم"} بإجمالي ${money(rows[0]?.total_sales)} جنيه من ${rows[0]?.orders || 0} طلب${suffix}`;
  if (report === "deposits_summary") return `إجمالي العربون المسجل ${money(summary.total)} جنيه من ${summary.count} عملية${suffix}`;
  if (report === "open_orders") return `عندك ${summary.count} طلب مفتوح، والمتبقي عليهم حوالي ${money(summary.total_remaining)} جنيه${suffix}`;
  if (report === "invoice_export") return `جهزت ملخص الفواتير: ${summary.invoices_count} فاتورة بإجمالي ${money(summary.total_sales)} جنيه${suffix}`;
  return `تمام، لقيت ${rows.length} نتيجة${suffix}`;
};

const findOrderDetails = async (supabaseClient: any, activeVersionId: string, orderNumber?: number, searchTerm?: string) => {
  const v = activeVersionId;
  if (!v) return { ok: false, error: "مفيش نسخة نشطة محددة" };

  let query = supabaseClient.from("orders").select("*").eq("version_id", v);

  if (orderNumber !== undefined && orderNumber !== null) {
    query = query.eq("order_number", orderNumber);
  } else if (searchTerm) {
    const s = `%${searchTerm.trim()}%`;
    query = query.or(`phone.ilike.${s},customer_name.ilike.${s},shop_name.ilike.${s}`);
  } else {
    return { ok: false, error: "لازم تحدد رقم الطلب أو كلمة البحث" };
  }

  const { data: orders, error: ordersErr } = await query.order("created_at", { ascending: false }).limit(5);

  if (ordersErr) return { ok: false, error: ordersErr.message };
  if (!orders || orders.length === 0) return { ok: false, error: "ملقتش أي طلب بالمواصفات دي." };

  const orderIds = orders.map((o: any) => o.id);
  const { data: items, error: itemsErr } = await supabaseClient
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  if (itemsErr) return { ok: false, error: itemsErr.message };

  const enrichedOrders = orders.map((o: any) => {
    const orderItems = (items || []).filter((item: any) => item.order_id === o.id);
    return {
      ...o,
      items: orderItems
    };
  });

  return { ok: true, orders: enrichedOrders };
};

const formatOrderDetailsText = (result: any): string => {
  if (!result.ok || !result.orders || result.orders.length === 0) {
    return result.error || "ملقتش أي طلب بالمواصفات دي.";
  }

  const money = (n: unknown) => Math.round(toNumber(n)).toLocaleString("ar-EG");

  if (result.orders.length === 1) {
    const o = result.orders[0];
    const itemsText = o.items.map((item: any, idx: number) => {
      const cancelledText = item.cancelled ? " (ملغي)" : "";
      return `${idx + 1}. **${item.product_name}** [${item.product_code}] - الكمية: ${item.quantity} - السعر: ${money(item.price)} ج.م${cancelledText}`;
    }).join("\n");

    const statusAr: Record<string, string> = {
      pending: "قيد الانتظار ⏳",
      completed: "مكتمل ✅",
      delivered: "تم التوصيل 🚚",
      cancelled: "ملغي ❌",
      processing: "جاري التحضير ⚙️"
    };

    const statusStr = statusAr[String(o.status || "").toLowerCase()] || o.status || "غير محدد";
    const dateStr = new Date(o.created_at).toLocaleDateString("ar-EG");
    const deliveryStr = o.delivery_date ? new Date(o.delivery_date).toLocaleDateString("ar-EG") : "غير محدد";

    return `### تفاصيل الطلب رقم ${o.order_number} 📦
* **العميل:** ${o.customer_name || "غير مسجل"}
* **المحل:** ${o.shop_name || "غير مسجل"}
* **التليفون:** ${o.phone || "غير مسجل"}
* **العنوان:** ${o.address || "غير مسجل"}
* **تاريخ الطلب:** ${dateStr}
* **تاريخ الشحن/التسليم:** ${deliveryStr}
* **شركة الشحن:** ${o.shipping_company || "غير مسجل"}
* **الحالة:** ${statusStr} (التقدم: ${o.progress_status || "غير محدد"})
* **المسؤول:** ${o.staff_member_name || "غير مسجل"}

#### 🛍️ المنتجات المطلوبة:
${itemsText}

---
* **الإجمالي:** ${money(o.total + (o.deposit_amount || 0))} ج.م
* **العربون:** ${money(o.deposit_amount)} ج.م (${o.deposit_method || "كاش"})
* **المتبقي للدفع:** ${money(o.total)} ج.م
${o.extra_info ? `\n* **ملاحظات إضافية:** ${o.extra_info}` : ""}`;
  }

  let text = `لقيت ${result.orders.length} طلبات تطابق بحثك:\n\n`;
  result.orders.forEach((o: any) => {
    text += `* **طلب رقم ${o.order_number}** - العميل: ${o.customer_name} - الإجمالي: ${money(o.total)} ج.م - الحالة: ${o.status}\n`;
  });
  text += `\nعشان تفتح طلب معين، اكتب مثلاً "افتح طلب ${result.orders[0].order_number}"`;
  return text;
};

const inferOrderNumber = (text: string): number | null => {
  const t = text.toLowerCase();
  const match = t.match(/(?:طلب|اوردر|رقم|order|no\.?)\s*#?\s*(\d+)/);
  if (match) return parseInt(match[1], 10);
  if (/^\d+$/.test(t.trim())) return parseInt(t.trim(), 10);
  return null;
};

const inferOrderSearch = (text: string): string | null => {
  const t = text.toLowerCase();
  const match = t.match(/(?:ابحث عن|دور على|ابحث|بحث|تفاصيل طلب|طلب العميل|محل)\s+(.+)/);
  if (match) return match[1].trim();
  const phoneMatch = t.match(/(01\d{9})/);
  if (phoneMatch) return phoneMatch[1];
  return null;
};


const AiAssistant = () => {
  const navigate = useNavigate();
  const { activeVersion } = useVersion();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load API Key from database on mount
  useEffect(() => {
    const loadKey = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'gemini_api_key')
        .maybeSingle();
      
      const fallbackKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      const finalKey = data?.value || fallbackKey;
      
      if (finalKey) {
        setGeminiApiKey(finalKey);
        setKeyInput(finalKey);
      }
    };
    loadKey();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const getPermissions = (): string[] => {
    const auth = sessionStorage.getItem('babyland_admin');
    if (auth === 'true') return ['all'];
    const staffData = sessionStorage.getItem('babyland_staff');
    if (staffData) {
      try { return JSON.parse(staffData).permissions || []; } catch { return []; }
    }
    return [];
  };

  const handleSaveKey = async () => {
    const key = keyInput.trim();
    if (!key) {
      toast.error('يرجى إدخال مفتاح API صحيح');
      return;
    }

    const { data: updateData, error: updateError } = await supabase
      .from('app_settings')
      .update({ value: key })
      .eq('key', 'gemini_api_key')
      .select();

    if (updateError) {
      toast.error('فشل حفظ مفتاح الـ API');
      return;
    }

    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from('app_settings')
        .insert({ key: 'gemini_api_key', value: key });
      
      if (insertError) {
        toast.error('فشل حفظ مفتاح الـ API');
        return;
      }
    }

    setGeminiApiKey(key);
    setSettingsOpen(false);
    toast.success('تم حفظ مفتاح API الخاص بـ Gemini بنجاح');
  };

  const executeActions = async (actions: any[]) => {
    for (const a of actions) {
      if (a.type === 'navigate' && a.path) {
        navigate(a.path);
        if (a.highlight) {
          sessionStorage.setItem('ai_highlight', String(a.highlight));
          setTimeout(() => window.dispatchEvent(new CustomEvent('ai-highlight', { detail: a.highlight })), 400);
        }
      } else if (a.type === 'export_excel' && a.rows?.length) {
        try {
          const ws = XLSX.utils.json_to_sheet(a.rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, (a.title || 'Data').slice(0, 30));
          const fname = a.filename.endsWith('.xlsx') ? a.filename : `${a.filename}.xlsx`;
          XLSX.writeFile(wb, fname);
          toast.success(`تم تنزيل ${fname}`);
        } catch {
          toast.error('فشل تصدير الإكسيل');
        }
      }
    }
  };

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || thinking) return;

    // 1. Quick bypass shortcuts (no LLM call, 100% free & local)
    const matchedOrderNumber = inferOrderNumber(userText);
    const matchedSearchTerm = inferOrderSearch(userText);

    if (matchedOrderNumber !== null || matchedSearchTerm !== null) {
      const newMsgs: Msg[] = [...messages, { role: 'user', content: userText }];
      setMessages(newMsgs);
      setInput('');
      setThinking(true);

      try {
        const result = await findOrderDetails(supabase, activeVersion?.id || '', matchedOrderNumber !== null ? matchedOrderNumber : undefined, matchedSearchTerm || undefined);
        const actions: any[] = [];
        
        // Auto-navigate to orders page and highlight if search was successful
        if (result.ok && result.orders?.length) {
          const mainOrder = result.orders[0];
          const queryTerm = matchedOrderNumber !== null ? String(matchedOrderNumber) : (matchedSearchTerm || '');
          actions.push({
            type: "navigate",
            path: `/admin/dashboard/orders?search=${encodeURIComponent(queryTerm)}`,
            highlight: `#${mainOrder.order_number}`
          });
        }

        setMessages(m => [...m, {
          role: 'assistant',
          content: formatOrderDetailsText(result),
          actions
        }]);
        await executeActions(actions);
        setThinking(false);
      } catch (e: any) {
        toast.error(e.message || 'حصل خطأ');
        setMessages(m => [...m, { role: 'assistant', content: 'حصل عندي مشكلة أثناء البحث عن الطلب.' }]);
        setThinking(false);
      }
      return;
    }

    const directReport = inferReport(userText);
    const directPath = /افتح|روح|وديني|وريني|show|open|go/.test(userText.toLowerCase()) ? inferNavigation(userText) : null;

    if (directReport || directPath) {
      const newMsgs: Msg[] = [...messages, { role: 'user', content: userText }];
      setMessages(newMsgs);
      setInput('');
      setThinking(true);

      try {
        if (directReport) {
          if (!canAccessReport(directReport, getPermissions())) {
            setMessages(m => [...m, { role: 'assistant', content: 'الصلاحية اللي معاك مش كافية للتقرير ده.' }]);
            setThinking(false);
            return;
          }
          const rawResult = await getReport(supabase, directReport, activeVersion?.id || '', wantsExcel(userText) ? 200 : 50);
          const result = sanitizeForPermissions(directReport, rawResult, getPermissions());
          const actions: any[] = [];
          if (directPath) {
            const first = result?.rows?.[0];
            const highlightVal = first?.order_number 
              ? `#${first.order_number}` 
              : (first?.code || first?.product_code || first?.customer_name || first?.phone);
            actions.push({ type: "navigate", path: directPath, highlight: highlightVal });
          }
          if (wantsExcel(userText) && result.ok && result.rows?.length) {
            actions.push({ type: "export_excel", filename: filenameForReport(directReport), rows: result.rows, title: filenameForReport(directReport).replace(".xlsx", "") });
          }
          setMessages(m => [...m, {
            role: 'assistant',
            content: result.ok ? reportText(directReport, result, actions.some((a) => a.type === "export_excel")) : (result.error || 'حصل مشكلة'),
            actions
          }]);
          await executeActions(actions);
          setThinking(false);
          return;
        }

        if (directPath) {
          const actions = [{ type: "navigate", path: directPath }];
          setMessages(m => [...m, { role: 'assistant', content: 'تمام، فتحتلك الصفحة المطلوبة.', actions }]);
          await executeActions(actions);
          setThinking(false);
          return;
        }
      } catch (e: any) {
        toast.error(e.message || 'حصل خطأ');
        setMessages(m => [...m, { role: 'assistant', content: 'حصل عندي مشكلة، حاول تاني.' }]);
        setThinking(false);
      }
      return;
    }

    // 2. Full LLM conversation and tool-calling loop (Gemini API)
    if (!geminiApiKey) {
      toast.error('يرجى إدخال مفتاح الـ API لـ Gemini أولاً من الإعدادات ⚙️');
      setSettingsOpen(true);
      return;
    }

    const newMsgs: Msg[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMsgs);
    setInput('');
    setThinking(true);

    try {
      const apiMessages = newMsgs.slice(-10).map(m => ({ role: m.role, content: m.content }));
      
      const systemPrompt = `أنت "بيبي" - المساعد الذكي لمحل Babyland لملابس الأطفال (شات مكتوب).

🎯 شخصيتك:
- بتتكلم مصري بحت زي ما المصريين بيتكلموا في الشغل. مش فصحى.
- ودود، عملي، وذكي. زي شريك شغل بيفهم في التجارة والأرقام.
- ردودك واضحة ومنظمة. ممكن تستخدم نقاط أو جداول صغيرة في النص لأن الرد بيتعرض مكتوب.

🛠️ قدراتك:
1. get_report: تقارير جاهزة موثوقة (مبيعات، طلبات، عملاء، مخزون، عربون). استخدمه دايماً للأسئلة الشائعة.
2. run_sql: SELECT حر لما تحتاج تحليل مخصوص (للمدير الكامل فقط). استخدم أسماء الأعمدة الحقيقية بالظبط.
3. navigate: ينقل المستخدم لصفحة وممكن يبرز عنصر.
4. export_excel: يصدر ملف. ممنوع تبعت rows من عندك — لازم تبعت report أو sql والسيرفر بيجيب البيانات الحقيقية.

📊 منهجية التحليل (مهم جداً):
- لما تتسأل تحليل، شغّل get_report أو run_sql الأول، اقرا الأرقام الفعلية، وبعدها رد بتحليل مبني عليها (مش تخمين).
- لو السؤال محتاج كذا زاوية (مثلاً "حللي مبيعات الأسبوع")، استدعي أكتر من تقرير/استعلام واجمع النتايج.
- ارجع بأرقام محددة: إجمالي، متوسط، أعلى/أقل، نسب نمو، أنماط.
- لو الداتا فاضية، قول كده بصراحة. متخترعش أرقام.

📁 الإكسيل:
- لما المستخدم يطلب شيت، استدعي export_excel بـ report المناسب (أو sql مخصوص). السيرفر هيملا البيانات.
- متبعتش rows في export_excel أبداً.
- لو الداتا فاضية، السيرفر هيرفض. وقتها قول للمستخدم إن مفيش بيانات للفترة دي.

⚙️ معلومات النظام:
- ID النسخة النشطة: ${activeVersion?.id || "غير محدد"}
- صلاحيات المستخدم: ${(getPermissions()).join(", ")}
${SCHEMA_DOC.replace("{ACTIVE_VERSION}", activeVersion?.id || "")}
${ROUTES}

❗ قواعد صارمة:
- ممنوع تخترع أرقام أو صفوف. كل رقم لازم يجي من tool.
- لو tool رجع error، جرّب get_report بديل أو SQL أبسط مرة واحدة قبل ما تعتذر.
- ردودك مكتوبة (مش صوت)، فاستخدم تنسيق منظم.`;

      let convo = [
        { role: 'system', content: systemPrompt },
        ...apiMessages
      ];
      let actions: any[] = [];
      let finalText = "";

      for (let i = 0; i < 6; i++) {
        // Use Gemini's OpenAI-compatible completions endpoint
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${geminiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: convo,
            tools: TOOLS,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "مشكلة في الاتصال بالذكاء الاصطناعي");
        }

        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) break;

        convo.push(msg);

        const toolCalls = msg.tool_calls || [];
        if (toolCalls.length === 0) {
          finalText = msg.content || "";
          break;
        }

        for (const call of toolCalls) {
          const name = call.function.name;
          let args: any = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch {}

          let result: any = { ok: true };

          if (name === "get_report") {
            if (!canAccessReport(args.report, getPermissions())) {
              result = { ok: false, error: "الصلاحية اللي معاك مش كافية للتقرير ده" };
            } else {
              const rawResult = await getReport(supabase, args.report, activeVersion?.id || "", args.limit);
              result = sanitizeForPermissions(args.report, rawResult, getPermissions());
            }
          } else if (name === "find_order") {
            const rawResult = await findOrderDetails(supabase, activeVersion?.id || "", args.order_number, args.search_term);
            result = rawResult;
            if (rawResult.ok && rawResult.orders?.length) {
              const mainOrder = rawResult.orders[0];
              const queryTerm = args.order_number ? String(args.order_number) : (args.search_term || '');
              actions.push({
                type: "navigate",
                path: `/admin/dashboard/orders?search=${encodeURIComponent(queryTerm)}`,
                highlight: `#${mainOrder.order_number}`
              });
            }
          } else if (name === "run_sql") {
            if (!isFullAdmin(getPermissions())) {
              result = { ok: false, error: "التحليل الحر متاح للمدير الكامل فقط. استخدم التقارير المتاحة حسب الصلاحية." };
            } else if (!isSafeSql(args.sql || "")) {
              result = { ok: false, error: "SELECT فقط مسموح" };
            } else {
              const { data: rows, error } = await supabase.rpc("execute_readonly_sql", { query: args.sql });
              if (error) {
                result = { ok: false, error: error.message, hint: "استخدم get_report أو أسماء الأعمدة الحقيقية" };
              } else {
                result = { ok: true, rows: rows, count: Array.isArray(rows) ? rows.length : 0 };
              }
            }
          } else if (name === "navigate") {
            actions.push({ type: "navigate", path: args.path, highlight: args.highlight, reason: args.reason });
            result = { ok: true, navigated_to: args.path };
          } else if (name === "export_excel") {
            const fname = String(args.filename || "تقرير").endsWith(".xlsx") ? args.filename : `${args.filename}.xlsx`;
            let rows: any[] = [];
            let err: string | null = null;
            if (args.report) {
              if (!canAccessReport(args.report, getPermissions())) {
                err = "الصلاحية مش كافية للتقرير ده";
              } else {
                const r = await getReport(supabase, args.report, activeVersion?.id || "", args.limit || 500);
                const safe = sanitizeForPermissions(args.report, r, getPermissions());
                if (!safe.ok) err = safe.error;
                else rows = safe.rows || [];
              }
            } else if (args.sql) {
              if (!isFullAdmin(getPermissions())) err = "SQL مخصص للمدير الكامل فقط";
              else if (!isSafeSql(args.sql)) err = "SELECT فقط مسموح";
              else {
                const { data: r, error } = await supabase.rpc("execute_readonly_sql", { query: args.sql });
                if (error) err = error.message;
                else rows = Array.isArray(r) ? r : [];
              }
            } else {
              err = "لازم تحدد report أو sql";
            }
            if (err) {
              result = { ok: false, error: err };
            } else if (!rows.length) {
              result = { ok: false, error: "ملقتش بيانات للتصدير، متعملش ملف فاضي" };
            } else {
              actions.push({ type: "export_excel", filename: fname, rows, title: args.title || fname.replace(".xlsx", "") });
              result = { ok: true, exported: fname, rows_count: rows.length };
            }
          }

          convo.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
      }

      setMessages(m => [...m, { role: 'assistant', content: finalText || 'تمام', actions }]);
      await executeActions(actions);
    } catch (e: any) {
      toast.error(e.message || 'حصل خطأ');
      setMessages(m => [...m, { role: 'assistant', content: 'حصل عندي مشكلة، حاول تاني.' }]);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('المتصفح ده مش بيدعم التعرف على الصوت. استخدم Chrome.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInput(prev => {
        const base = prev.trim();
        const piece = (final || interim).trim();
        if (!piece) return base;
        return base ? `${base} ${piece}` : piece;
      });
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error('مشكلة في الميكروفون');
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); } catch {}
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const examples = [
    'كام طلب النهاردة؟',
    'وريني المنتجات اللي قربت تخلص',
    'اعمللي إكسيل بمبيعات الأسبوع',
    'مين أكتر عميل بيشتري؟',
  ];

  return (
    <div className="min-h-[calc(100vh-3rem)] -m-6 relative overflow-hidden bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a1a3e] flex flex-col">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(0,200,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,100,200,.15) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
      }} />
      <div className="absolute top-10 right-10 w-72 h-72 rounded-full blur-3xl opacity-20 bg-pink-500 animate-pulse pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full blur-3xl opacity-20 bg-cyan-400 animate-pulse pointer-events-none" style={{ animationDelay: '1s' }} />

      {/* Header */}
      <div className="relative z-10 px-6 py-4 border-b border-white/10 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
            <Sparkles className="h-6 w-6 text-white" />
            <span className="absolute inset-0 rounded-full border border-white/30 animate-ping opacity-50" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              بيبي · المساعد الذكي
            </h1>
            <p className="text-xs text-white/50">شات نصي مع إدخال صوتي · تحليلات وإكسيل من بيانات حقيقية</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setSettingsOpen(true)} variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/10">
            <Settings className="h-4 w-4 ml-1" /> الإعدادات
          </Button>
          {messages.length > 0 && (
            <Button onClick={clearChat} variant="ghost" size="sm" className="text-white/60 hover:text-white hover:bg-white/10">
              <Trash2 className="h-4 w-4 ml-1" /> مسح
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto text-center mt-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <span className="text-xs text-white/80 tracking-widest">BABYLAND AI · v2.0</span>
            </div>
            <h2 className="text-3xl font-bold text-white">إزيك يا باشا؟ اسألني أي حاجة عن المحل</h2>
            <p className="text-white/60">اكتب أو دوس على المايك واتكلم. هرد عليك بتحليل من البيانات الحقيقية، ولو طلبت إكسيل هنزّله بصفوف فعلية.</p>
            <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
              {examples.map((p, i) => (
                <button
                  key={i}
                  onClick={() => send(p)}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 text-white/80 text-sm text-right transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-gradient-to-r from-cyan-500/30 to-cyan-600/30 text-white border border-cyan-400/30'
                : 'bg-white/5 backdrop-blur-xl text-white border border-pink-400/20'
            }`}>
              {m.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none [&>*]:my-2 [&_table]:border [&_table]:border-white/20 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/20 [&_td]:border [&_td]:border-white/20">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
              {m.actions?.filter((a: any) => a.type === 'export_excel').map((a: any, j: number) => (
                <div key={j} className="mt-2 flex items-center gap-1.5 text-xs text-cyan-200">
                  <Download className="h-3 w-3" /> {a.filename} ({a.rows?.length || 0} صف)
                </div>
              ))}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-pink-400/20 text-white/70 text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> بفكر وبحلل البيانات...
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative z-10 p-4 border-t border-white/10 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <Button
            type="button"
            onClick={startListening}
            disabled={thinking}
            size="icon"
            className={`rounded-full h-12 w-12 shrink-0 transition-all ${
              listening
                ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/50 animate-pulse'
                : 'bg-gradient-to-br from-cyan-500 to-pink-500 hover:opacity-90 shadow-lg shadow-pink-500/30'
            }`}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={listening ? 'بسمعك...' : 'اكتب سؤالك أو دوس المايك واتكلم...'}
            disabled={thinking}
            rows={1}
            className="flex-1 min-h-12 max-h-32 resize-none bg-white/5 backdrop-blur-xl border-white/10 text-white placeholder:text-white/40 focus-visible:ring-pink-400/50"
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            size="icon"
            className="rounded-full h-12 w-12 shrink-0 bg-gradient-to-br from-pink-500 to-cyan-500 hover:opacity-90 shadow-lg shadow-cyan-500/30"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إعدادات المساعد الذكي (Gemini API)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="أدخل مفتاح Gemini API هنا..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                يمكنك الحصول على مفتاح API مجاناً من Google AI Studio. سيتم حفظ هذا المفتاح في إعدادات الموقع لتشغيل شات الذكاء الاصطناعي.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleSaveKey} className="w-full">
                حفظ الإعدادات
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AiAssistant;
