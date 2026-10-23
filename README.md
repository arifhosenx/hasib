# RELAXBD storefront & control room

A responsive streetwear storefront with a Supabase-backed admin portal for the product catalog, inventory, customer orders, bKash transaction review, promotions, website content, customer records, and delivery settings.

## Set up the shared store database

1. Create a [Supabase project](https://supabase.com/dashboard) and open **SQL Editor**.
2. Run [`supabase/schema.sql`](./supabase/schema.sql). It creates the tables, storefront policies, admin-only data access, a public product-image bucket with admin-only uploads (5 MB maximum), sample products, and secure order and discount functions. If you already ran an older version, run the updated SQL again.
3. In **Project Settings → API**, copy the project URL and the **publishable** key (or legacy `anon` key). Add them to [`config.js`](./config.js):

   ```js
   window.RELAXBD_CONFIG = {
     supabaseUrl: "https://YOUR_PROJECT.supabase.co",
     supabaseAnonKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
   };
   ```

   The publishable/anon key is intended for a public browser. **Never** put a Supabase `service_role` or secret key in `config.js` or other frontend files.

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

All admin pages require a signed-in account explicitly listed in `admin_users`. Row-level security keeps customer records, orders, and management operations private. Storefront order placement and discount validation use database functions that check current prices, stock, promotions, and delivery settings on the server.

## Run locally

From this folder, start any static HTTP server. For example:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/` for the storefront and `http://localhost:8000/admin.html` for the control room.

## Order payments

bKash orders use **Send Money**: the customer pays the configured number, then submits the transaction ID at checkout. New transactions appear as **Payment review** and are not treated as paid until an administrator verifies them in their bKash account. Cash on delivery is also available. The checkout does not connect to or initiate payments through the bKash API.

## Admin capabilities

- Add/edit and publish/archive products; upload product photos or use image URLs, and set category, price, sale price, and stock.
- Create, publish, and archive storefront categories and see low-stock items.
- Review orders and customer contact/delivery details; update fulfilment state.
- Review submitted bKash transaction IDs and explicitly approve/reject payment; cancelled orders automatically return stock.
- Create/pause promotion codes with a percentage or fixed discount, minimum spend, and usage limit.
- Edit the home page, story, FAQs, announcements, contact details, Facebook Page and WhatsApp links, bKash number, and delivery fees.

The Supabase publishable key can be public only because the included database policies enforce access. Keep the schema and policies in sync with any future database changes.
