// External API - Secure Endpoint for Client Bot Integration
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function generateTextInvoice(order: any, items: any[], subtotal: number, total: number) {
  let text = `🧸 *فاتورة بيبي لاند | Babyland* 🧸\n`;
  text += `رقم الطلب: #${order.order_number}\n`;
  text += `التاريخ: ${new Date(order.created_at).toLocaleDateString("ar-EG")}\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `👤 *العميل:* ${order.customer_name}\n`;
  if (order.shop_name) text += `🏪 *المحل:* ${order.shop_name}\n`;
  text += `📞 *الهاتف:* ${order.phone}\n`;
  if (order.address) text += `📍 *العنوان:* ${order.address}\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `📦 *المنتجات:*\n\n`;

  items.forEach((item: any, index: number) => {
    text += `${index + 1}. ${item.product_name}\n`;
    text += `   الكود: ${item.product_code}\n`;
    text += `   الكمية: ${item.quantity} | السعر: ${item.price} ج.م\n\n`;
  });

  text += `━━━━━━━━━━━━━━━━\n`;
  text += `💰 *الإجمالي الفرعي:* ${subtotal} ج.م\n`;
  if (order.deposit_amount > 0) {
    const methodLabel = order.deposit_method === 'instapay' ? 'إنستا باي' : 
                         order.deposit_method === 'vodafone_cash' ? 'فودافون كاش' : 'كاش';
    text += `💵 *العربون (${methodLabel}):* ${order.deposit_amount} ج.م\n`;
    text += `✅ *المتبقي للدفع عند الاستلام:* ${total} ج.م\n`;
  } else {
    text += `✅ *المطلوب عند الاستلام:* ${total} ج.م\n`;
  }
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `شكراً لتعاملكم معنا! 🧸✨`;
  return text;
}


Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate Request via custom X-API-Key header
    const requestApiKey = req.headers.get("x-api-key");
    const configuredApiKey = Deno.env.get("EXTERNAL_API_KEY");

    if (!configuredApiKey) {
      console.error("EXTERNAL_API_KEY environment secret is not configured in Supabase.");
      return new Response(
        JSON.stringify({ error: "API configuration error. Please set EXTERNAL_API_KEY secret." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!requestApiKey || requestApiKey !== configuredApiKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Invalid or missing X-API-Key header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request payload
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Only POST requests are supported." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, data } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Client using Service Role key to bypass RLS policies safely
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve Active Version ID if not specified in request
    let activeVersionId = data?.version_id;
    if (!activeVersionId) {
      const { data: defaultVersions } = await supabase
        .from("versions")
        .select("id")
        .eq("is_active", true)
        .limit(1);

      if (defaultVersions && defaultVersions.length > 0) {
        activeVersionId = defaultVersions[0].id;
      } else {
        const { data: fallbackVersions } = await supabase
          .from("versions")
          .select("id")
          .order("created_at", { ascending: true })
          .limit(1);
        if (fallbackVersions && fallbackVersions.length > 0) {
          activeVersionId = fallbackVersions[0].id;
        }
      }
    }

    if (!activeVersionId) {
      return new Response(
        JSON.stringify({ error: "No active versions found in the database." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Process Actions
    if (action === "get_products") {
      const query = data?.query || "";
      const limit = Math.min(Number(data?.limit || 20), 100);

      let dbQuery = supabase
        .from("products")
        .select("id, code, name, description, price, stock_quantity, image_url")
        .eq("version_id", activeVersionId);

      if (query) {
        dbQuery = dbQuery.or(`code.ilike.%${query}%,name.ilike.%${query}%`);
      }

      const { data: products, error } = await dbQuery.limit(limit);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, products }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } 
    
    if (action === "create_order") {
      const {
        customer_name,
        shop_name,
        phone,
        address,
        items, // Array of { product_id, code, name, price, quantity }
        deposit_amount = 0,
        deposit_method,
        extra_info = "",
        staff_member_id,
        staff_member_name
      } = data;

      if (!customer_name || !phone || !items || !Array.isArray(items) || items.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing required order fields: customer_name, phone, items (array)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate products exist and we have sufficient stock
      const productIds = items.map((i: any) => i.product_id);
      const { data: dbProducts, error: prodError } = await supabase
        .from("products")
        .select("id, code, name, price, stock_quantity")
        .in("id", productIds)
        .eq("version_id", activeVersionId);

      if (prodError) throw prodError;

      const productMap = new Map(dbProducts?.map((p) => [p.id, p]));

      // Verify stock
      for (const item of items) {
        const dbProd = productMap.get(item.product_id);
        if (!dbProd) {
          return new Response(
            JSON.stringify({ error: `Product ID ${item.product_id} not found or mismatch version.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (dbProd.stock_quantity < item.quantity) {
          return new Response(
            JSON.stringify({
              error: `Insufficient stock for product: ${dbProd.name} (${dbProd.code}). Available: ${dbProd.stock_quantity}, Requested: ${item.quantity}`
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Calculate totals
      let subtotal = 0;
      const orderItemsToInsert = items.map((item: any) => {
        const dbProd = productMap.get(item.product_id)!;
        const price = Number(item.price || dbProd.price);
        const qty = Number(item.quantity);
        subtotal += price * qty;

        return {
          product_id: item.product_id,
          product_code: dbProd.code,
          product_name: dbProd.name,
          price,
          quantity: qty,
          version_id: activeVersionId
        };
      });

      const total = subtotal - Number(deposit_amount);

      // Create Order
      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_name,
          shop_name,
          phone,
          address,
          branch: data.branch || null,
          delivery_date: data.delivery_date || null,
          shipping_company: data.shipping_company || null,
          deposit_method: deposit_amount > 0 ? deposit_method : null,
          deposit_amount: Number(deposit_amount),
          subtotal,
          total,
          status: "pending",
          progress_status: "pending",
          extra_info,
          version_id: activeVersionId,
          staff_member_id: staff_member_id || null,
          staff_member_name: staff_member_name || null
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create Order Items
      const finalizedItems = orderItemsToInsert.map((item) => ({
        ...item,
        order_id: newOrder.id
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(finalizedItems);

      if (itemsError) throw itemsError;

      // Note: Triggers automatically handle stock deduction and deposits insertion in Supabase.

      // Call telegram notification if set up (optional / try-catch)
      try {
        const telegramFuncUrl = `${supabaseUrl}/functions/v1/send-telegram-notification`;
        const lowStockAlerts = dbProducts
          ?.filter((p) => {
            const requested = items.find((it) => it.product_id === p.id)?.quantity || 0;
            return p.stock_quantity - requested <= 5; // Alert if remaining quantity after order is <= 5
          })
          .map((p) => {
            const requested = items.find((it) => it.product_id === p.id)?.quantity || 0;
            return {
              code: p.code,
              name: p.name,
              remaining: p.stock_quantity - requested
            };
          });

        await fetch(telegramFuncUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            orderNumber: newOrder.order_number,
            branch: data.branch || null,
            customerName: customer_name,
            shopName: shop_name,
            phone,
            address,
            items: finalizedItems.map((fi) => ({
              code: fi.product_code,
              name: fi.product_name,
              quantity: fi.quantity,
              price: fi.price
            })),
            subtotal,
            total,
            depositAmount: Number(deposit_amount),
            depositMethod,
            extraInfo: extra_info,
            lowStockProducts: lowStockAlerts,
            staffName: staff_member_name
          })
        });
      } catch (tgError) {
        console.error("Failed to trigger telegram notification:", tgError);
      }

      const textInvoice = generateTextInvoice(newOrder, finalizedItems, subtotal, total);

      return new Response(
        JSON.stringify({
          success: true,
          order_id: newOrder.id,
          order_number: newOrder.order_number,
          total,
          subtotal,
          invoice: {
            order_number: newOrder.order_number,
            customer_name,
            shop_name,
            phone,
            address,
            items: finalizedItems,
            subtotal,
            deposit_amount: Number(deposit_amount),
            deposit_method,
            total,
            created_at: newOrder.created_at,
            text_receipt: textInvoice
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_order_status") {
      const orderNumber = data?.order_number;
      const phone = data?.phone;

      if (!orderNumber && !phone) {
        return new Response(
          JSON.stringify({ error: "Specify order_number or phone to search order status." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let orderQuery = supabase
        .from("orders")
        .select("id, order_number, customer_name, shop_name, phone, status, progress_status, total, created_at")
        .eq("version_id", activeVersionId);

      if (orderNumber) {
        orderQuery = orderQuery.eq("order_number", Number(orderNumber));
      } else if (phone) {
        orderQuery = orderQuery.eq("phone", phone);
      }

      const { data: orders, error } = await orderQuery.order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, orders }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("API execution error:", error);
    const msg = error instanceof Error ? error.message : (error?.message || error?.details || JSON.stringify(error) || "Internal server error");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
