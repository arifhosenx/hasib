create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Store admin',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 140),
  subtitle text not null default '',
  category text not null references public.categories (slug) on update cascade on delete restrict,
  price integer not null check (price >= 0),
  compare_at_price integer check (compare_at_price is null or compare_at_price > price),
  badge text not null default 'Just in',
  image text not null,
  alt text not null default '',
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text not null default '',
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  min_subtotal integer not null default 0 check (min_subtotal >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status text not null check (
    status in ('payment_review', 'pending', 'processing', 'shipped', 'delivered', 'cancelled')
  ),
  payment_method text not null check (payment_method in ('bkash', 'cash_on_delivery')),
  payment_status text not null check (
    payment_status in ('submitted', 'verified', 'rejected', 'cash_on_delivery')
  ),
  bkash_transaction_id text,
  promotion_id uuid references public.promotions (id) on delete set null,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  total integer not null check (total >= 0),
  customer_note text not null default '',
  inventory_restocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (payment_method = 'bkash' and length(trim(coalesce(bkash_transaction_id, ''))) > 0)
    or (payment_method = 'cash_on_delivery' and bkash_transaction_id is null)
  )
);

create unique index if not exists orders_bkash_transaction_id_unique
  on public.orders (bkash_transaction_id)
  where bkash_transaction_id is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  subtitle text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists products_active_category_idx
  on public.products (active, category, featured desc, created_at desc);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_store_admin()));
drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_store_admin()))
  with check (bucket_id = 'product-images' and (select public.is_store_admin()));
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_store_admin()));

alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.site_settings enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Admins read their own account" on public.admin_users;
create policy "Admins read their own account"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Categories are public when active" on public.categories;
create policy "Categories are public when active"
  on public.categories for select to anon, authenticated
  using (active or (select public.is_store_admin()));
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
  on public.categories for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Active products are public" on public.products;
create policy "Active products are public"
  on public.products for select to anon, authenticated
  using (active or (select public.is_store_admin()));
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
  on public.products for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Active promotions are public" on public.promotions;
drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions"
  on public.promotions for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Store settings are public" on public.site_settings;
create policy "Store settings are public"
  on public.site_settings for select to anon, authenticated
  using (true);
drop policy if exists "Admins manage store settings" on public.site_settings;
create policy "Admins manage store settings"
  on public.site_settings for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Admins manage customers" on public.customers;
create policy "Admins manage customers"
  on public.customers for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
  on public.orders for all to authenticated
  using ((select public.is_store_admin()))
  with check ((select public.is_store_admin()));

drop policy if exists "Admins read order items" on public.order_items;
create policy "Admins read order items"
  on public.order_items for select to authenticated
  using ((select public.is_store_admin()));

grant select on public.admin_users to authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.promotions to authenticated;
grant insert, update, delete on public.promotions to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
grant select on public.customers to authenticated;
grant update on public.customers to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();
drop trigger if exists settings_set_updated_at on public.site_settings;
create trigger settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

create or replace function public.restore_cancelled_order_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and not old.inventory_restocked then
    update public.products as p
    set stock = p.stock + oi.quantity
    from public.order_items as oi
    where oi.order_id = new.id
      and oi.product_id = p.id;
    new.inventory_restocked := true;
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'Cancelled orders cannot be reopened';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_restore_inventory on public.orders;
create trigger orders_restore_inventory
  before update of status on public.orders
  for each row execute function public.restore_cancelled_order_inventory();

create or replace function public.place_order(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_payment_method text,
  p_transaction_id text,
  p_items jsonb,
  p_promo_code text default null,
  p_customer_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'ORN-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_product public.products%rowtype;
  v_line record;
  v_promotion public.promotions%rowtype;
  v_has_promotion boolean := false;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_delivery_fee integer := 0;
  v_free_shipping_threshold integer := null;
  v_total integer;
  v_phone text;
  v_transaction_id text;
  v_item_count integer;
  v_settings jsonb;
begin
  if p_customer_name is null or length(trim(p_customer_name)) not between 2 and 100 then
    raise exception 'Enter a valid name (2–100 characters)';
  end if;
  if p_address is null or length(trim(p_address)) not between 8 and 500 then
    raise exception 'Enter a complete delivery address';
  end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone) not in (11, 13)
    or (length(v_phone) = 11 and v_phone not like '01%')
    or (length(v_phone) = 13 and v_phone not like '8801%') then
    raise exception 'Enter a valid Bangladesh phone number';
  end if;
  if length(trim(coalesce(p_customer_note, ''))) > 500 then
    raise exception 'Order note must be 500 characters or fewer';
  end if;
  if p_payment_method is null or p_payment_method not in ('bkash', 'cash_on_delivery') then
    raise exception 'Choose a supported payment method';
  end if;
  if p_payment_method = 'bkash' then
    select coalesce(value, '{}'::jsonb) into v_settings
    from public.site_settings where key = 'store';
    if nullif(trim(coalesce(v_settings ->> 'bkash_number', '')), '') is null then
      raise exception 'The store has not configured a bKash payment number';
    end if;
  end if;
  v_transaction_id := nullif(upper(trim(coalesce(p_transaction_id, ''))), '');
  if p_payment_method = 'bkash' and (v_transaction_id is null or length(v_transaction_id) not between 4 and 64) then
    raise exception 'Enter the bKash transaction ID for your payment';
  end if;
  if p_payment_method = 'cash_on_delivery' then
    v_transaction_id := null;
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your basket is empty or contains too many different items';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Your basket is empty or contains too many different items';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    where item.product_id is null
      or item.quantity is null
      or item.quantity < 1
      or item.quantity > 20
  ) or (
    select count(*) <> count(distinct item.product_id)
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  ) then
    raise exception 'Your basket contains an invalid item or quantity';
  end if;
  if p_payment_method = 'bkash' and exists (
    select 1 from public.orders
    where bkash_transaction_id = v_transaction_id
  ) then
    raise exception 'This bKash transaction ID has already been submitted';
  end if;

  select coalesce(value, '{}'::jsonb) into v_settings
  from public.site_settings where key = 'store';
  v_delivery_fee := greatest(0, coalesce((v_settings ->> 'delivery_fee')::integer, 150));
  v_free_shipping_threshold := nullif((v_settings ->> 'free_shipping_threshold')::integer, 0);

  for v_line in
    select p.id as product_id, p.name, p.subtitle, p.price, p.stock, item.quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.products as p on p.id = item.product_id
    where p.active
    order by p.id
    for update of p
  loop
    if v_line.stock < v_line.quantity then
      raise exception 'Not enough stock for "%"', v_line.name;
    end if;
    v_subtotal := v_subtotal + (v_line.price * v_line.quantity);
  end loop;

  select count(*) into v_item_count
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer);
  if (select count(*) from public.products p
      join jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
        on item.product_id = p.id
      where p.active) <> v_item_count then
    raise exception 'One or more items in your basket are no longer available';
  end if;

  if nullif(trim(coalesce(p_promo_code, '')), '') is not null then
    select * into v_promotion
    from public.promotions
    where code = upper(trim(p_promo_code))
      and active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
      and (usage_limit is null or used_count < usage_limit)
    for update;
    if not found then
      raise exception 'That discount code is invalid or has expired';
    end if;
    if v_subtotal < v_promotion.min_subtotal then
      raise exception 'Your order does not meet the minimum for this discount';
    end if;
    v_has_promotion := true;
    if v_promotion.discount_type = 'percentage' then
      v_discount := least(v_subtotal, floor(v_subtotal * v_promotion.discount_value / 100.0)::integer);
    else
      v_discount := least(v_subtotal, v_promotion.discount_value);
    end if;
  end if;

  if v_free_shipping_threshold is not null and v_subtotal >= v_free_shipping_threshold then
    v_delivery_fee := 0;
  end if;
  v_total := v_subtotal - v_discount + v_delivery_fee;

  insert into public.customers (full_name, phone, address)
  values (trim(p_customer_name), v_phone, trim(p_address))
  on conflict (phone) do update
    set full_name = excluded.full_name,
        address = excluded.address
  returning id into v_customer_id;

  insert into public.orders (
    id, order_number, customer_id, status, payment_method, payment_status,
    bkash_transaction_id, promotion_id, subtotal, discount, delivery_fee,
    total, customer_note
  )
  values (
    v_order_id, v_order_number, v_customer_id,
    case when p_payment_method = 'bkash' then 'payment_review' else 'pending' end,
    p_payment_method,
    case when p_payment_method = 'bkash' then 'submitted' else 'cash_on_delivery' end,
    v_transaction_id, case when v_has_promotion then v_promotion.id end,
    v_subtotal, v_discount, v_delivery_fee, v_total,
    trim(coalesce(p_customer_note, ''))
  );

  for v_line in
    select p.id as product_id, p.name, p.subtitle, p.price, item.quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.products as p on p.id = item.product_id
    where p.active
    order by p.id
  loop
    update public.products set stock = stock - v_line.quantity where id = v_line.product_id;
    insert into public.order_items (order_id, product_id, product_name, subtitle, quantity, unit_price)
    values (v_order_id, v_line.product_id, v_line.name, v_line.subtitle, v_line.quantity, v_line.price);
  end loop;

  if v_has_promotion then
    update public.promotions set used_count = used_count + 1 where id = v_promotion.id;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', v_total);
end;
$$;

revoke all on function public.place_order(text, text, text, text, text, jsonb, text, text) from public;
grant execute on function public.place_order(text, text, text, text, text, jsonb, text, text) to anon, authenticated;

create or replace function public.validate_promotion(
  p_code text,
  p_subtotal integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.promotions%rowtype;
  v_discount integer;
begin
  if p_subtotal is null or p_subtotal < 0 then
    raise exception 'Enter a valid order amount';
  end if;
  select * into v_promotion
  from public.promotions
  where code = upper(trim(coalesce(p_code, '')))
    and active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and (usage_limit is null or used_count < usage_limit);
  if not found then
    raise exception 'That discount code is invalid or has expired';
  end if;
  if p_subtotal < v_promotion.min_subtotal then
    raise exception 'Your order does not meet the minimum for this discount';
  end if;
  if v_promotion.discount_type = 'percentage' then
    v_discount := least(p_subtotal, floor(p_subtotal * v_promotion.discount_value / 100.0)::integer);
  else
    v_discount := least(p_subtotal, v_promotion.discount_value);
  end if;
  return jsonb_build_object(
    'code', v_promotion.code,
    'discount', v_discount,
    'description', v_promotion.description
  );
end;
$$;

revoke all on function public.validate_promotion(text, integer) from public;
grant execute on function public.validate_promotion(text, integer) to anon, authenticated;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_store_admin() then
    raise exception 'Admin access is required';
  end if;
  return jsonb_build_object(
    'sales', coalesce((
      select sum(total)
      from public.orders
      where status <> 'cancelled'
        and (
          payment_status = 'verified'
          or (payment_status = 'cash_on_delivery' and status = 'delivered')
        )
    ), 0),
    'orders_count', (select count(*) from public.orders),
    'pending_count', (select count(*) from public.orders where status in ('payment_review', 'pending')),
    'payment_review_count', (select count(*) from public.orders where payment_status = 'submitted'),
    'products_count', (select count(*) from public.products where active)
  );
end;
$$;

revoke all on function public.admin_dashboard_summary() from public;
grant execute on function public.admin_dashboard_summary() to authenticated;

insert into public.categories (slug, name)
values
  ('t-shirts', 'T-shirts'),
  ('shirts', 'Shirts'),
  ('bottoms', 'Bottoms'),
  ('accessories', 'Accessories')
on conflict (slug) do nothing;

insert into public.products (name, subtitle, category, price, compare_at_price, badge, image, alt, stock, featured)
select seed.name, seed.subtitle, seed.category, seed.price, seed.compare_at_price, seed.badge, seed.image, seed.alt, seed.stock, seed.featured
from (values
  ('Core heavyweight tee', 'Black · Relaxed fit', 't-shirts', 1290, null::integer, 'Bestseller', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85', 'White heavyweight cotton t-shirt', 20, true),
  ('Daybreak overshirt', 'Natural · Boxy fit', 'shirts', 2190, null::integer, 'Just in', 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=85', 'Neutral overshirt on a hanger', 12, true),
  ('After hours graphic tee', 'Charcoal · Relaxed fit', 't-shirts', 1490, null::integer, 'Just in', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=85', 'Dark graphic t-shirt styled for the street', 18, true),
  ('Everyday utility cargo', 'Olive · Straight leg', 'bottoms', 2890, null::integer, 'Limited', 'https://images.unsplash.com/photo-1517445312882-bc9910d016b7?auto=format&fit=crop&w=900&q=85', 'Olive utility trousers', 8, true),
  ('Form camp-collar shirt', 'Stone · Easy fit', 'shirts', 1990, null::integer, 'Just in', 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=85', 'Casual short-sleeve shirt', 14, false),
  ('Weekend carryall tote', 'Natural · Heavy canvas', 'accessories', 790, null::integer, 'Small batch', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85', 'Everyday canvas carryall bag', 25, false),
  ('Studio boxy tee', 'Off-white · Boxy fit', 't-shirts', 1390, null::integer, 'Just in', 'https://images.unsplash.com/photo-1527719327859-c6ce80353573?auto=format&fit=crop&w=900&q=85', 'Off-white boxy cotton t-shirt', 16, false),
  ('Weekender easy short', 'Washed black · Easy fit', 'bottoms', 1590, 1890, '−16%', 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=900&q=85', 'Relaxed everyday shorts', 10, false)
) as seed(name, subtitle, category, price, compare_at_price, badge, image, alt, stock, featured)
where not exists (select 1 from public.products);

insert into public.site_settings (key, value)
values (
  'store',
  '{
    "announcement": "Made for the streets. Built in Bangladesh.",
    "announcement_detail": "Free delivery on orders over ৳2,500",
    "free_shipping_threshold": 2500,
    "delivery_fee": 150,
    "hero_eyebrow": "Drop 04 — The everyday edit",
    "hero_line_1": "FRESH",
    "hero_line_2": "OFF THE",
    "hero_line_3": "STREET.",
    "hero_description": "New energy for your everyday rotation. Thoughtful fits, heavyweight feel, made to move with you.",
    "hero_image": "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=1400&q=85",
    "hero_image_alt": "Model wearing a relaxed streetwear outfit",
    "collection_line_1": "THE NEW",
    "collection_line_2": "ROTATION.",
    "collection_description": "Good things don''t stay new for long. Get into the latest RELAXBD pieces before they find their people.",
    "story_kicker": "FROM HERE, FOR EVERYWHERE",
    "story_line_1": "LOCAL",
    "story_line_2": "ROOTS.",
    "story_line_3": "LOUDER",
    "story_line_4": "FUTURE.",
    "story_description": "We make clothes for real life, right here in Bangladesh. Better fabrics, considered fits, and a little more room to be yourself.",
    "story_image": "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85",
    "story_image_alt": "Streetwear look photographed outdoors",
    "contact_phone": "+8801305827996",
    "contact_email": "hello@ornix.com.bd",
    "facebook_url": "",
    "bkash_number": "",
    "whatsapp_number": "",
    "faqs": [
      {"question": "How long does delivery take?", "answer": "Orders usually arrive in 1–2 business days in Dhaka and 3–5 business days elsewhere in Bangladesh. Our team will share delivery updates with you."},
      {"question": "Can I exchange an item?", "answer": "Yes. We accept exchanges within 7 days of delivery for sizing issues or manufacturing defects. Items must be unworn and have their original tags."},
      {"question": "What payment methods do you accept?", "answer": "Pay with bKash, Nagad, or cash on delivery in eligible areas. Any advance delivery fee will be confirmed with you when placing your order."}
    ]
  }'::jsonb
)
on conflict (key) do nothing;
