// supabase/functions/_shared/cors.ts
//
// Origin diambil dari env var ALLOWED_ORIGIN (di-set lewat
// `supabase secrets set ALLOWED_ORIGIN=https://domain-netlify-kamu.app`).
// Kalau belum di-set (mis. waktu development lokal), fallback ke '*'
// supaya gak nge-block diri sendiri pas development — TAPI begitu
// sudah deploy ke production, WAJIB set env var ini ke domain
// Netlify kamu, jangan biarkan '*'.
//
// Kenapa penting: tanpa ini, siapa pun bisa bikin halaman HTML di
// domain lain yang manggil create-transaction pakai anon key publik
// kamu (anon key memang publik & aman dipakai browser, tapi endpoint
// create-transaction sebaiknya cuma dipanggil dari domain resmi kamu
// biar gak disalahgunakan buat spam checkout dari domain orang lain).
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'

if (allowedOrigin === '*') {
  console.warn(
    'ALLOWED_ORIGIN belum di-set — CORS masih wildcard (*). ' +
      'Set `supabase secrets set ALLOWED_ORIGIN=https://domain-kamu.netlify.app` sebelum production.'
  )
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}
