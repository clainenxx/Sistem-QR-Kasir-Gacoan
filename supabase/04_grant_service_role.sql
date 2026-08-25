-- =====================================================================
-- STEP 3-FIX-2: GRANT service_role — jalankan sekali di SQL Editor
-- =====================================================================
-- Error yang muncul:
--   "permission denied for table products" (code 42501)
--   hint: GRANT SELECT ON public.products TO service_role;
--
-- Penyebab: sama seperti 02_grants.sql (base GRANT Postgres belum
-- ke-set), tapi kali ini untuk role `service_role` — yang dipakai
-- Edge Function create-transaction & midtrans-webhook (createClient
-- pakai SUPABASE_SERVICE_ROLE_KEY). service_role SEHARUSNYA otomatis
-- bypass RLS + punya akses penuh, tapi base GRANT tetap harus ada
-- dulu di Postgres sebelum RLS dievaluasi — persis analoginya dengan
-- kasus anon/authenticated sebelumnya.
--
-- PENTING: file ini aman dijalankan kapan saja (gak akan error walau
-- rate_limits/check_rate_limit belum ada, lihat DO block di bawah),
-- TAPI kode Edge Function create-transaction SEKARANG MANGGIL RPC
-- check_rate_limit. Kalau kamu cuma jalanin file ini tanpa jalanin
-- 03_security_hardening.sql, checkout TETAP akan gagal (pesan error
-- beda: "function check_rate_limit does not exist"). Jadi urutan
-- yang benar tetap: 01 -> 02 -> 03 -> 04.
-- =====================================================================

-- products: dibaca (ambil harga asli) oleh create-transaction
grant select on public.products to service_role;

-- orders & order_items: insert (bikin order baru) oleh create-transaction,
-- select + update (ubah status jadi paid/failed/expired) oleh
-- midtrans-webhook & create-transaction (rollback delete kalau gagal)
grant select, insert, update, delete on public.orders to service_role;
grant select, insert, update, delete on public.order_items to service_role;

-- profiles: gak wajib buat 2 function ini, tapi service_role idealnya
-- emang selalu punya akses penuh ke semua tabel public (dia trusted
-- backend role) — aman & lazim di-grant sekalian.
grant select, insert, update, delete on public.profiles to service_role;

-- rate_limits: sudah dipakai lewat RPC check_rate_limit yang jalan
-- sebagai owner (security definer), jadi harusnya gak perlu grant
-- tambahan. Tapi jaga-jaga kalau nanti mau akses tabel ini langsung
-- dari service_role (mis. buat maintenance script), grant sekalian.
--
-- Dibungkus DO block + cek pg_tables supaya gak error kalau file ini
-- ke-jalanin SEBELUM 03_security_hardening.sql (yang bikin tabel ini)
-- — kalau tabelnya belum ada, baris ini di-skip aja, gak bikin file
-- ini gagal total.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'rate_limits'
  ) then
    execute 'grant select, insert, update, delete on public.rate_limits to service_role';
  else
    raise notice 'Tabel public.rate_limits belum ada — lewati grant ini. Jalankan 03_security_hardening.sql dulu kalau mau fitur rate limiting aktif.';
  end if;
end $$;

-- Function check_rate_limit sudah di-grant ke service_role di
-- 03_security_hardening.sql — kalau kamu belum sempat jalanin file
-- itu, baris ini di-skip juga (bukan wajib, cuma jaga-jaga) supaya
-- gak bikin error kalau functionnya belum ada.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_rate_limit'
  ) then
    execute 'grant execute on function public.check_rate_limit(text, int, int) to service_role';
  else
    raise notice 'Function public.check_rate_limit belum ada — lewati grant ini. Jalankan 03_security_hardening.sql dulu kalau mau fitur rate limiting aktif.';
  end if;
end $$;

-- =====================================================================
-- SELESAI. Coba checkout lagi — POST ke create-transaction harusnya
-- gak lagi 500 "permission denied".
-- =====================================================================
