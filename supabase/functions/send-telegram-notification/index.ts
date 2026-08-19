const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    if (!TELEGRAM_CHAT_ID) {
      throw new Error('TELEGRAM_CHAT_ID is not configured');
    }

    const { orderNumber, branch, customerName, shopName, phone, address, items, subtotal, total, depositAmount, depositMethod, extraInfo, lowStockProducts, staffName } = await req.json();

    // Build message
    let message = `🧸 *طلب جديد \\#${orderNumber}*\n\n`;
    if (branch) {
      message += `🏢 *الفرع:* ${escapeMarkdown(branch)}\n`;
    }
    if (staffName) {
      message += `👷 *بواسطة موظف:* ${escapeMarkdown(staffName)}\n`;
    }
    message += `👤 *العميل:* ${escapeMarkdown(customerName)}\n`;
    if (shopName) message += `🏪 *المحل:* ${escapeMarkdown(shopName)}\n`;
    message += `📞 *الهاتف:* ${escapeMarkdown(phone)}\n`;
    if (address) message += `📍 *العنوان:* ${escapeMarkdown(address)}\n`;
    if (extraInfo) message += `📝 *ملاحظات:* ${escapeMarkdown(extraInfo)}\n`;
    message += `\n━━━━━━━━━━━━━━━━\n`;
    message += `📦 *المنتجات:*\n\n`;

    if (items && Array.isArray(items)) {
      items.forEach((item: any, index: number) => {
        message += `${index + 1}\\. ${escapeMarkdown(item.name)}\n`;
        message += `   الكود: ${escapeMarkdown(item.code)}\n`;
        message += `   الكمية: ${item.quantity}\n`;
        message += `   السعر: ${item.price} ج\\.م\n\n`;
      });
    }

    message += `━━━━━━━━━━━━━━━━\n`;
    message += `💰 *الإجمالي:* ${subtotal} ج\\.م\n`;
    if (depositAmount > 0) {
      const methodLabel = depositMethod === 'instapay' ? 'InstaPay' : 
                         depositMethod === 'vodafone_cash' ? 'فودافون كاش' : 'كاش';
      message += `💵 *العربون \\(${escapeMarkdown(methodLabel)}\\):* ${depositAmount} ج\\.م\n`;
    }
    message += `✅ *المطلوب:* ${total} ج\\.م`;

    // Add low stock alert if any
    if (lowStockProducts && Array.isArray(lowStockProducts) && lowStockProducts.length > 0) {
      message += `\n\n🚨🚨 *تنبيه نقص المخزون* 🚨🚨\n\n`;
      lowStockProducts.forEach((p: any) => {
        const statusEmoji = p.remaining <= 0 ? '🔴' : '🟡';
        const statusText = p.remaining <= 0 ? 'نفذ من المخزون' : `متبقي ${p.remaining} قطعة فقط`;
        message += `${statusEmoji} ${escapeMarkdown(p.code)} \\- ${escapeMarkdown(p.name)}: *${escapeMarkdown(statusText)}*\n`;
      });
    }

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'MarkdownV2',
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Telegram API error:', result);
      throw new Error(`Telegram API error [${response.status}]: ${JSON.stringify(result)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
