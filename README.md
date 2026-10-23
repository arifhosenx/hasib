# RELAXBD storefront & control room

A responsive streetwear storefront with a Supabase-backed admin portal for the product catalog, inventory, customer orders, bKash/Nagad payment review, promotions, website content, customer records, and delivery settings.

## Set up the shared store database

1. Create a [Supabase project](https://supabase.com/dashboard) and open **SQL Editor**.
2. Run [`supabase/schema.sql`](./supabase/schema.sql). It creates the tables, storefront policies, admin-only data access, a public product-image bucket with admin-only uploads (5 MB maximum), sample products, and secure order and discount functions. If you already ran an older version, run the updated SQL again.
3. In **Project Settings → API**, copy the project URL and the **publishable** key (or legacy `anon` key). Add them to [`config.js`](./config.js):

   ```js
   window.RELAXBD_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY",
     bkashPersonalNumber: "01XXXXXXXXX",
     nagadPersonalNumber: "01XXXXXXXXX"
   };
   ```

   The publishable/anon key is intended for a public browser. **Never** put a Supabase `service_role` or secret key in `config.js` or other frontend files.
   Wallet numbers are public payment details; replace the examples with the store's actual numbers.

4. In **Authentication → Providers → Email**, enable email/password sign-in and turn off public sign-ups. Create the store owner's user from **Authentication → Users → Add user** and confirm the email.
5. In the SQL Editor, grant that account admin access (replace the example email and name):

   ```sql
   insert into public.admin_users (user_id, display_name)
   select id, 'Store owner'
   from auth.users
   where email = 'owner@example.com'
   on conflict (user_id) do update
     set display_name = excluded.display_name;
   ```

6. Serve the project from a web server (opening `index.html` directly with `file://` does not load the Supabase browser client). Open `admin.html` and sign in with the admin email/password.

The storefront includes a data-driven category section. In **Admin → Categories**, add a category and optionally provide an image URL; without one, its first active product image is used. Category links use the static-host-compatible `category.html?view=all` and `category.html?slug=<slug>` routes. Optional Vercel rewrites in `vercel.json` also support the shorter `/categories` and `/category/<slug>` URLs.

All admin pages require a signed-in account explicitly listed in `admin_users`. Row-level security keeps customer records, orders, and management operations private. Storefront order placement and discount validation use database functions that check current prices, stock, promotions, and delivery settings on the server.

## Run locally

From this folder, start any static HTTP server. For example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/` for the storefront and `http://localhost:8000/admin.html` for the control room.

## Order payments

Customers can pay an advance delivery charge and pay the remaining balance on delivery, or pay the full order total up front. bKash and Nagad both use **Send Money**; the customer enters their wallet phone and transaction ID. New payments appear as **Payment review** and are not treated as paid until an administrator verifies them. The checkout does not connect to or initiate payments through either wallet API.

Order notifications are sent by a Supabase Edge Function using the WhatsApp Cloud API after an order is saved. Apply the updated SQL, deploy with `supabase functions deploy order-notification --no-verify-jwt` (the webhook uses its own shared-secret header), then add these values as Supabase Edge Function secrets (never in `config.js`): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ORDER_NOTIFICATION_PHONE` (digits with country code), `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE`, `WHATSAPP_GRAPH_API_VERSION`, and a random `ORDER_NOTIFICATION_WEBHOOK_SECRET`. Supabase injects the project URL and secret API key into the function runtime.

Create and get approval for a WhatsApp template with eight body variables in this order: order number, customer name, customer phone, products, total, advance, delivery balance, delivery address. For example: `New RELAXBD order {{1}} from {{2}} ({{3}}). Items: {{4}}. Total: {{5}}. Advance: {{6}}. Due on delivery: {{7}}. Address: {{8}}.` Configure a Supabase Database Webhook on `public.order_notification_outbox` inserts, targeting the deployed `order-notification` function with the `x-relaxbd-webhook-secret` header matching the function secret. The private outbox tracks notification status; test the approved Meta template and webhook after deploying.

## Admin capabilities

- Add/edit and publish/archive products; upload product photos or use image URLs, and set category, price, sale price, and stock.
- Create, publish, and archive storefront categories, optionally assign category-card image URLs, and see low-stock items.
- In **Admin → Store settings → Logo & brand color**, choose a transparent PNG (recommended) or JPG/WebP/AVIF logo up to 5 MB, select the matching accent color, then save. The logo appears in the storefront header and footer; use **Use text logo instead** to remove it.
- Review orders and customer contact/delivery details; update fulfilment state.
- Review submitted bKash/Nagad transaction IDs and explicitly approve/reject payment; cancelled orders automatically return stock.
- Create/pause promotion codes with a percentage or fixed discount, minimum spend, and usage limit.
- Edit the home page, story, FAQs, announcements, contact details, Facebook Page and WhatsApp links, and delivery fees. Set wallet payment numbers in `config.js`.

The Supabase publishable key can be public only because the included database policies enforce access. Keep the schema and policies in sync with any future database changes.
