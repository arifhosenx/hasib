type OrderWebhook = {
  type?: string;
  table?: string;
  schema?: string;
  record?: { order_id?: string; status?: string };
};

type OrderRecord = {
  order_number: string;
  total: number;
  advance_amount: number;
  cash_due_amount: number;
  payment_method: string;
  payment_plan: string | null;
  customers: { full_name: string; phone: string; address: string } | null;
  order_items: Array<{ product_name: string; quantity: number; size: string | null }>;
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
};

function constantTimeEquals(expected: string, received: string) {
  if (expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

async function callSupabase(
  baseUrl: string,
  serviceKey: string,
  path: string,
  body?: Record<string, unknown>
) {
  return fetch(`${baseUrl}/rest/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      ...(body ? { prefer: "return=representation" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000)
  });
}

const money = (amount: number) => `BDT ${Number(amount).toLocaleString("en-BD")}`;

async function completeNotification(
  baseUrl: string,
  serviceKey: string,
  orderId: string,
  sent: boolean,
  errorMessage = ""
) {
  try {
    const response = await callSupabase(baseUrl, serviceKey, "rpc/complete_order_notification", {
      p_order_id: orderId,
      p_sent: sent,
      p_error: errorMessage
    });
    if (!response.ok) {
      console.error("Could not record notification status.", response.status);
      return false;
    }
    return Boolean(await response.json());
  } catch (error) {
    console.error("Could not record notification status.", error);
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  let webhookSecret: string;
  let supabaseUrl: string;
  let serviceKey: string;
  let whatsappToken: string;
  let whatsappPhoneId: string;
  let recipient: string;
  let templateName: string;
  let templateLanguage: string;
  let graphVersion: string;
  try {
    webhookSecret = requiredEnv("ORDER_NOTIFICATION_WEBHOOK_SECRET");
    supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
    const secretKeysValue = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeysValue) {
      const secretKeys = JSON.parse(secretKeysValue) as Record<string, string>;
      serviceKey = secretKeys.default || "";
      if (!serviceKey) throw new Error("The default Supabase secret key is unavailable");
    } else {
      serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    }
    whatsappToken = requiredEnv("WHATSAPP_ACCESS_TOKEN");
    whatsappPhoneId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
    recipient = requiredEnv("ORDER_NOTIFICATION_PHONE").replace(/\D/g, "");
    templateName = requiredEnv("WHATSAPP_TEMPLATE_NAME");
    templateLanguage = requiredEnv("WHATSAPP_TEMPLATE_LANGUAGE");
    graphVersion = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
  } catch (error) {
    console.error("Order notification is not configured.", error);
    return jsonResponse(500, { error: "Order notification is not configured" });
  }

  if (!/^\d{8,15}$/.test(recipient) || !/^v\d+\.\d+$/.test(graphVersion)) {
    console.error("Order notification recipient or Graph API version is invalid.");
    return jsonResponse(500, { error: "Order notification settings are invalid" });
  }
  if (!constantTimeEquals(webhookSecret, request.headers.get("x-relaxbd-webhook-secret") || "")) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let event: OrderWebhook;
  try {
    event = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid webhook payload" });
  }
  if (event.type !== "INSERT" || event.table !== "order_notification_outbox" || event.schema !== "public") {
    return jsonResponse(200, { skipped: true });
  }
  const orderId = event.record?.order_id || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return jsonResponse(400, { error: "Invalid order notification id" });
  }

  let claimResponse: Response;
  try {
    claimResponse = await callSupabase(supabaseUrl, serviceKey, "rpc/claim_order_notification", {
      p_order_id: orderId
    });
  } catch (error) {
    console.error("Could not claim order notification.", error);
    return jsonResponse(502, { error: "Could not claim order notification" });
  }
  if (!claimResponse.ok) {
    console.error("Could not claim order notification.", claimResponse.status);
    return jsonResponse(502, { error: "Could not claim order notification" });
  }
  if (!await claimResponse.json()) return jsonResponse(200, { skipped: true });

  try {
    const query = new URLSearchParams({
      select: "order_number,total,advance_amount,cash_due_amount,payment_method,payment_plan,customers(full_name,phone,address),order_items(product_name,quantity,size)",
      id: `eq.${orderId}`
    });
    const orderResponse = await callSupabase(supabaseUrl, serviceKey, `orders?${query}`);
    if (!orderResponse.ok) throw new Error(`Could not load order details (${orderResponse.status})`);
    const orders = await orderResponse.json() as OrderRecord[];
    const order = orders[0];
    if (!order) throw new Error("Order details were not found");

    const items = (order.order_items || []).map((item) =>
      `${item.product_name}${item.size ? ` (${item.size})` : ""} x ${item.quantity}`
    ).join("; ").slice(0, 900) || "Item details unavailable";
    const customer = order.customers;
    const templateParameters = [
      order.order_number,
      customer?.full_name || "Customer",
      customer?.phone || "—",
      items,
      money(order.total),
      money(order.advance_amount),
      money(order.cash_due_amount),
      customer?.address || "—"
    ].map((text) => ({ type: "text", text: String(text).slice(0, 1024) }));
    const whatsappBody = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [{ type: "body", parameters: templateParameters }]
      }
    };

    let whatsappResponse: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        whatsappResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${whatsappPhoneId}/messages`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${whatsappToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(whatsappBody),
          signal: AbortSignal.timeout(15000)
        });
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      if (whatsappResponse.ok || (whatsappResponse.status < 500 && whatsappResponse.status !== 429)) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!whatsappResponse?.ok) {
      throw new Error(`WhatsApp Cloud API returned status ${whatsappResponse?.status || "unknown"}`);
    }

    const recorded = await completeNotification(supabaseUrl, serviceKey, orderId, true);
    return jsonResponse(200, { sent: true, recorded });
  } catch (error) {
    console.error("Could not deliver order notification.", error);
    await completeNotification(
      supabaseUrl,
      serviceKey,
      orderId,
      false,
      error instanceof Error ? error.message : "Notification delivery failed"
    );
    return jsonResponse(502, { error: "Could not deliver order notification" });
  }
});
