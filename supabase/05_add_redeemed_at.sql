-- =====================================================================
-- STEP 12-A: Tambah redeemed_at ke RPC get_order_by_qr_token
-- Jalankan setelah 03_security_hardening.sql (fungsi ini dibuat ulang
-- di 03 dengan tambahan rate limit — sekarang kita tambahin 1 kolom
-- lagi biar halaman /order/:token bisa nampilin jam berapa QR-nya
-- discan admin).
-- =====================================================================

-- Wajib DROP dulu — CREATE OR REPLACE gak bisa dipakai di sini karena
-- kita nambah kolom baru (redeemed_at) ke return type-nya, dan
-- Postgres gak izinin CREATE OR REPLACE mengubah struktur kolom hasil
-- fungsi (row type dari OUT parameters harus persis sama). DROP dulu
-- baru CREATE aman dilakukan karena fungsi ini gak dipakai fungsi lain
-- (cuma dipanggil langsung dari frontend lewat RPC).
drop function if exists public.get_order_by_qr_token(uuid);

create function public.get_order_by_qr_token(p_token uuid)
returns table (
  id uuid,
  status text,
  total_amount numeric,
  qr_expires_at timestamptz,
  redeemed boolean,
  redeemed_at timestamptz,
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

  if not public.check_rate_limit('qr_lookup:' || v_ip, 30, 60) then
    raise exception 'Terlalu banyak permintaan, coba lagi sebentar.'
      using errcode = '42901';
  end if;

  return query
  select o.id, o.status, o.total_amount, o.qr_expires_at,
         o.redeemed, o.redeemed_at, o.customer_name, o.created_at
  from public.orders o
  where o.qr_token = p_token;
end;
$$;

grant execute on function public.get_order_by_qr_token(uuid) to anon, authenticated;

-- =====================================================================
-- SELESAI. Refresh halaman /order/:token — respons RPC sekarang ikut
-- bawa redeemed_at.
-- =====================================================================
