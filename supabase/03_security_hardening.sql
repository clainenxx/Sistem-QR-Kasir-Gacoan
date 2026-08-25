-- =====================================================================
-- STEP 11: SECURITY HARDENING — jalankan di SQL Editor
-- (setelah 01_supabase_schema.sql dan 02_grants.sql)
-- =====================================================================
-- Isi file ini:
--   A. Rate limiting dasar (tabel + fungsi) dipakai oleh Edge Function
--      create-transaction, dan oleh RPC publik get_order_by_qr_token /
--      get_order_items_by_qr_token (biar gak bisa di-hammer buat coba
--      nebak qr_token walau secara matematis UUID v4 nyaris mustahil
--      ditebak).
--   B. Batasan bucket Storage (ukuran file & tipe MIME) — sebelumnya
--      cuma divalidasi di React (bisa dilewati kalau orang manggil
--      Storage API langsung).
--   C. CHECK constraint tambahan di tabel (panjang teks, format email,
--      batas wajar harga & quantity) — defense-in-depth, bukan
--      pengganti validasi di Edge Function.
--   D. Review kecil RLS: pastikan anon/authenticated CUMA bisa hal
--      yang memang dimaksud.
-- =====================================================================


-- =====================================================================
-- A. RATE LIMITING
-- =====================================================================

-- Tabel counter per "key" (mis. "order:email:foo@bar.com" atau
-- "order:ip:1.2.3.4" atau "qr_lookup:1.2.3.4"), sliding-ish window
-- sederhana (reset begitu window_start lebih tua dari window_seconds).
create table public.rate_limits (
  key text primary key,
  count int not null default 1,
  window_start timestamptz not null default now()
);

-- RLS aktif TANPA policy apa pun -> anon & authenticated (lewat
-- PostgREST/browser) sama sekali gak bisa SELECT/INSERT/UPDATE tabel
-- ini secara langsung. Hanya bisa diakses lewat fungsi security
-- definer di bawah, atau service_role (Edge Function) yang memang
-- bypass RLS.
alter table public.rate_limits enable row level security;

-- Fungsi utama: return true kalau request masih dalam batas,
-- false kalau sudah melebihi p_max_requests dalam p_window_seconds
-- terakhir untuk key tersebut. SECURITY DEFINER supaya bisa dipanggil
-- dari dalam fungsi publik lain (get_order_by_qr_token) walau
-- pemanggil aslinya anon.
create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits%rowtype;
begin
  select * into v_row from public.rate_limits where key = p_key for update;

  if not found then
    insert into public.rate_limits (key, count, window_start)
    values (p_key, 1, now());
    return true;
  end if;

  if v_row.window_start < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limits
    set count = 1, window_start = now()
    where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max_requests then
    return false;
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;

-- CATATAN: sengaja TIDAK di-grant ke anon/authenticated. Edge Function
-- (create-transaction) manggil ini pakai service_role, yang bypass RLS
-- dan grant sama sekali (selalu boleh). Untuk RPC publik di bawah,
-- pemanggilan check_rate_limit terjadi DI DALAM fungsi security
-- definer lain yang dimiliki owner (postgres) — jadi tetap jalan
-- walau caller aslinya anon, tanpa perlu grant tambahan.
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- Housekeeping opsional: hapus baris rate_limits yang sudah basi
-- (>1 hari) biar tabel gak numpuk terus. Jalankan manual dari waktu
-- ke waktu, atau jadwalkan lewat Supabase Cron / pg_cron kalau mau.
create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
revoke all on function public.cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_rate_limits() to service_role;


-- ---------------------------------------------------------------------
-- Pasang rate limit ke RPC publik get_order_by_qr_token /
-- get_order_items_by_qr_token. Diganti dari LANGUAGE sql -> plpgsql
-- (karena sekarang perlu logic + baca header request), dan dari
-- STABLE -> (default) VOLATILE karena nulis ke rate_limits.
--
-- IP diambil dari header `x-forwarded-for` yang disisipkan PostgREST/
-- Supabase (current_setting('request.headers', true)). Kalau kosong
-- (mis. dipanggil dari SQL Editor manual), fallback ke 'unknown' —
-- semua caller tanpa IP jelas berbagi 1 bucket, cukup buat kondisi
-- normal karena traffic ini memang selalu lewat HTTP di production.
-- ---------------------------------------------------------------------

create or replace function public.get_order_by_qr_token(p_token uuid)
returns table (
  id uuid,
  status text,
  total_amount numeric,
  qr_expires_at timestamptz,
  redeemed boolean,
  customer_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
begin
  v_ip := coalesce(
    split_part((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ',', 1),
    'unknown'
  );

  -- Maks 30 lookup / menit per IP. Halaman /order/:token polling tiap
  -- 4 detik selagi pending (~15x/menit), jadi 30 masih longgar buat
  -- 1 user tapi tetap membatasi percobaan tebak token massal.
  if not public.check_rate_limit('qr_lookup:' || v_ip, 30, 60) then
    raise exception 'Terlalu banyak permintaan, coba lagi sebentar.'
      using errcode = '42901';
  end if;

  return query
  select o.id, o.status, o.total_amount, o.qr_expires_at,
         o.redeemed, o.customer_name, o.created_at
  from public.orders o
  where o.qr_token = p_token;
end;
$$;

create or replace function public.get_order_items_by_qr_token(p_token uuid)
returns table (
  product_name text,
  price numeric,
  quantity int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
begin
  v_ip := coalesce(
    split_part((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ',', 1),
    'unknown'
  );

  if not public.check_rate_limit('qr_lookup:' || v_ip, 30, 60) then
    raise exception 'Terlalu banyak permintaan, coba lagi sebentar.'
      using errcode = '42901';
  end if;

  return query
  select oi.product_name, oi.price, oi.quantity
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.qr_token = p_token;
end;
$$;

-- Grant lama masih berlaku (execute ke anon, authenticated), tapi
-- diulang di sini biar file ini bisa dijalankan sendirian kalau perlu.
grant execute on function public.get_order_by_qr_token(uuid) to anon, authenticated;
grant execute on function public.get_order_items_by_qr_token(uuid) to anon, authenticated;


-- =====================================================================
-- B. BATASAN STORAGE BUCKET (product-images)
-- =====================================================================
-- Sebelumnya validasi tipe & ukuran file HANYA di AddProduct.jsx
-- (client-side) — orang yang punya akun admin (atau JWT admin yang
-- dicuri/dipakai lewat curl) tetap bisa upload file apa pun lewat
-- Storage API langsung. Kunci juga di level bucket:
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB, samain dengan batas di AddProduct.jsx
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'product-images';


-- =====================================================================
-- C. CHECK CONSTRAINTS TAMBAHAN (defense-in-depth)
-- =====================================================================
-- Edge Function create-transaction sudah validasi ini, tapi kalau
-- suatu saat ada jalur insert lain (mis. admin nambah order manual
-- dari SQL editor, atau bug), constraint di DB tetap jaga integritas
-- data dasar.

alter table public.orders
  add constraint orders_customer_email_format
  check (customer_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

alter table public.orders
  add constraint orders_customer_name_length
  check (char_length(customer_name) between 1 and 200);

alter table public.orders
  add constraint orders_total_amount_sane
  check (total_amount > 0 and total_amount < 100000000); -- < 100 juta, sanity check

alter table public.products
  add constraint products_name_length
  check (char_length(name) between 1 and 200);

alter table public.products
  add constraint products_description_length
  check (char_length(description) <= 2000);

alter table public.products
  add constraint products_price_sane
  check (price >= 0 and price < 100000000);

alter table public.order_items
  add constraint order_items_quantity_sane
  check (quantity > 0 and quantity <= 50);


-- =====================================================================
-- D. REVIEW RLS — pastikan role yang gak semestinya emang gak bisa apa-apa
-- =====================================================================
-- Ini query BACAAN doang (buat kamu jalanin & CEK manual, bukan bikin
-- objek baru), supaya kelihatan ringkas semua policy yang aktif per
-- tabel. Jalankan, terus bandingkan dengan daftar yang diharapkan di
-- README bagian "Checklist keamanan Step 11".

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- Yang diharapkan (ringkas):
--   profiles     : select -> user (own row) + admin (all). Tidak ada
--                  insert/update/delete policy untuk anon/authenticated.
--   products     : select -> public (is_active) + admin (all).
--                  insert/update/delete -> admin only.
--   orders       : select/update -> admin only. TIDAK ADA insert
--                  policy sama sekali (insert cuma lewat service_role
--                  di create-transaction).
--   order_items  : select -> admin only. TIDAK ADA insert policy
--                  (sama, cuma lewat service_role).
--   rate_limits  : TIDAK ADA policy sama sekali (cuma lewat fungsi
--                  security definer / service_role).

-- =====================================================================
-- SELESAI STEP 11 (bagian SQL). Lanjut ke Edge Functions & .env yang
-- sudah diupdate berbarengan dengan file ini.
-- =====================================================================
