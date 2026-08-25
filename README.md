# Dapur Ibu — Food Ordering App (Portfolio Project)

React + Vite + Tailwind (frontend, deploy ke Netlify) + Supabase (database,
auth, storage, edge functions) + Midtrans Snap Sandbox (payment).

## Status

- **Step 1** — Supabase schema selesai (lihat `01_supabase_schema.sql`).
- **Step 2** — Scaffold project: routing, auth context, cart store, struktur folder.
- **Step 3** — Login & Signup (`/login`, `/signup` — tidak ada di Navbar,
  hanya bisa diakses lewat URL langsung). Signup daftar sebagai role
  `user` biasa; jadikan admin manual lewat Supabase Table Editor.
- **Step 4** — Home (grid menu, fetch dari tabel `products` yang
  `is_active = true`) dan Product Detail (`/product/:id`, pilih jumlah,
  tombol "Masukkan ke Keranjang").
- **Step 5** — `CartPopup`: bar mengambang di bawah layar, muncul di
  semua halaman publik (termasuk `/checkout`, `/order/:token`,
  `/login`, `/signup`) tapi TIDAK di `/admin/*`. Bisa expand buat
  lihat/ubah jumlah/hapus item, tombol "Bayar" ke `/checkout`.
- **Step 6** — Halaman Checkout: ringkasan pesanan, form nama + email
  (tervalidasi), preload Midtrans Snap sandbox, submit yang manggil
  Edge Function `create-transaction`.
- **Step 7** — Edge Functions `create-transaction` (bikin order +
  minta `snap_token` ke Midtrans) dan `midtrans-webhook` (verifikasi
  signature, update status order, generate expiry QR 24 jam). Lihat
  `supabase/functions/`.

- **Step 8** — Email notifikasi lewat Resend API (`supabase/functions/_shared/email.ts`),
  dipanggil dari `midtrans-webhook`: email "pembayaran berhasil" (link QR)
  dan email "pembayaran gagal/expired".
- **Step 9** — Halaman QR publik `/order/:token` (`OrderQR.jsx`): polling
  status tiap 4 detik selagi `pending`, render QR (isi = full URL) pakai
  `qrcode.react` begitu `paid`, handle status `failed`/`expired`.
- **Step 10** — Admin: `Dashboard` (statistik pesanan & pendapatan),
  `Transactions` (list order + filter status + expand rincian item),
  `AddProduct` (form + upload foto ke Storage), `Scanner` (buka kamera
  pakai `html5-qrcode`, redeem lewat RPC `redeem_order_by_qr_token`).

- **Step 11** — Security hardening:
  - Rate limiting dasar di database (`rate_limits` table + fungsi
    `check_rate_limit`, lihat `03_security_hardening.sql`): dipakai
    `create-transaction` (per email & per IP) dan RPC publik
    `get_order_by_qr_token` / `get_order_items_by_qr_token` (per IP).
  - Validasi input lebih ketat di `create-transaction` (batas panjang
    nama/email, maks jumlah jenis produk & quantity per item).
  - Bucket Storage `product-images` dikunci di level server
    (`file_size_limit` 5MB, `allowed_mime_types` gambar saja) — bukan
    cuma validasi di form React.
  - CHECK constraint tambahan di `orders`/`products`/`order_items`
    (format email, panjang teks, batas harga & quantity wajar).
  - `midtrans-webhook` sekarang cross-check `gross_amount` dari
    Midtrans vs `total_amount` di database (log warning kalau beda,
    sebagai lapisan tambahan di luar verifikasi signature).
  - CORS Edge Functions gak lagi wildcard permanen — pakai env var
    `ALLOWED_ORIGIN` (fallback `*` cuma buat development, ada warning
    di log kalau lupa di-set).
  - `netlify.toml`: SPA redirect + security headers (CSP, X-Frame-
    Options, dll) buat frontend.
  - `.env.example` buat frontend.

Semua 11 step di rencana awal sudah selesai. Checklist keamanan
sebelum benar-benar deploy production ada di bagian
"Checklist keamanan Step 11" di bawah.

- **Step 12** (perbaikan & fitur tambahan setelah testing):
  - `Signup.jsx` sekarang kirim `emailRedirectTo` eksplisit (ikut
    domain yang lagi diakses) — tapi domain itu tetap harus
    didaftarkan di Supabase Dashboard > Authentication > URL
    Configuration > Redirect URLs, lihat "Troubleshooting" di bawah.
  - RPC `get_order_by_qr_token` sekarang ikut balikin `redeemed_at`
    (`05_add_redeemed_at.sql`).
  - `/order/:token`: polling diperpanjang jadi 2 fase — nunggu
    pembayaran (cepat, 2 menit) lalu nunggu di-redeem admin (santai,
    20 menit) — begitu QR discan sementara halaman kebuka, status
    "✓ Pesanan sudah diambil" + jam scan muncul otomatis tanpa refresh.
  - Admin `Scanner.jsx`: setelah scan berhasil (`ok` atau
    `already_redeemed`), langsung tampilkan nama pemesan, rincian item
    + jumlah, dan total harga — gak perlu buka halaman Transaksi lagi
    buat lihat pesanan mana yang harus diserahkan.

- **Step 13** (lanjutan perbaikan):
  - Email lewat Resend sekarang selalu menyertakan versi plain-text
    (`text`) selain HTML, plus header `reply_to` — sedikit membantu
    deliverability, tapi perbaikan UTAMA soal email masuk folder Spam
    ada di bagian "Troubleshooting > Email masuk Spam" di bawah
    (verify domain di Resend), bukan sesuatu yang bisa "dikodein".
  - Admin `Scanner.jsx`: begitu scan **berhasil** (`ok` atau
    `already_redeemed`), kamera langsung dimatikan dan admin
    di-redirect ke halaman baru `/admin/scan-result/:token`
    (`ScanResult.jsx`) — layar penuh dengan ceklis besar + nama
    pemesan + rincian item + total, TANPA kamera lagi di layar yang
    sama. Tombol "Scan Pesanan Berikutnya" balik ke `/admin/scanner`
    dan buka kamera dari awal. Status gagal (QR salah/belum
    dibayar/kedaluwarsa) TETAP tampil inline di halaman scanner
    (bukan pindah halaman) supaya admin bisa langsung coba QR lain.

## Setup lokal (frontend)

```bash
cd food-app
npm install
cp .env.example .env   # isi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MIDTRANS_CLIENT_KEY
npm run dev
```

Ambil `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` dari Supabase
Dashboard → Project Settings → API (pakai key **anon `public`**, bukan
`service_role`). `VITE_MIDTRANS_CLIENT_KEY` dari Midtrans Dashboard
sandbox → Settings → Access Keys (yang **Client Key**, diawali
`SB-Mid-client-`).

Pastikan kamu sudah menjalankan `01_supabase_schema.sql` dan
`02_grants.sql` di SQL Editor project Supabase kamu.

## Deploy Edge Functions (Step 7) — pakai Supabase CLI

```bash
# sekali saja: install & login CLI, link ke project
npm install -g supabase
supabase login
supabase link --project-ref <project-ref-kamu>

# set secret Server Key Midtrans (JANGAN pernah taruh ini di .env frontend)
supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxx

# set secret Resend (buat email notifikasi sukses/gagal/expired)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
supabase secrets set FRONTEND_URL=https://dapur-ibu.netlify.app

# deploy kedua function
supabase functions deploy create-transaction
supabase functions deploy midtrans-webhook --no-verify-jwt
```

`config.toml` di repo ini sudah menandai `midtrans-webhook` dengan
`verify_jwt = false` (Midtrans manggil endpoint ini tanpa Supabase
JWT) — flag `--no-verify-jwt` di atas cuma jaga-jaga kalau deploy
tanpa membaca `config.toml`.

Setelah deploy, daftarkan URL webhook di **Midtrans Dashboard (Sandbox)
→ Settings → Configuration → Payment Notification URL**:

```
https://<project-ref>.supabase.co/functions/v1/midtrans-webhook
```

## Cara test alur pembayaran (sandbox)

1. Tambah produk ke keranjang → Checkout → isi nama & email → "Lanjut ke Pembayaran".
2. Popup Snap Midtrans muncul → pilih metode pembayaran sandbox (mis.
   kartu test Midtrans, atau simulator bank transfer) → selesaikan.
3. Midtrans kirim notifikasi ke `midtrans-webhook` → status order di
   tabel `orders` berubah jadi `paid`, `qr_expires_at` ke-set 24 jam
   dari sekarang.
4. Browser redirect ke `/order/:qr_token` (halaman ini baru dibangun
   di step 9 — untuk sekarang masih placeholder).

## Deploy

- **Frontend**: push ke GitHub, connect ke Netlify (root directory
  `food-app`), set environment variables yang sama seperti `.env`,
  build command `npm run build`, publish directory `dist`.
- **Backend**: Supabase — schema (step 1) + grants (`02_grants.sql`) +
  Edge Functions (step 7, lihat di atas).

## Struktur folder

```
food-app/                  frontend (Vite + React + Tailwind)
  src/
    components/   Navbar, ProtectedRoute, CartPopup
    context/      AuthContext (session & role user)
    store/        cartStore (zustand, state keranjang)
    lib/          supabase.js, format.js, midtrans.js
    pages/        halaman publik (Home, ProductDetail, Login, Signup, Checkout, OrderQR)
    pages/admin/  halaman khusus admin (dilindungi ProtectedRoute)

supabase/                  backend (Supabase CLI project)
  config.toml     verify_jwt per-function
  functions/
    _shared/cors.ts
    create-transaction/    bikin order + minta snap_token ke Midtrans
    midtrans-webhook/      terima notifikasi Midtrans, update status order
```

## Catatan keamanan

- File `.env` tidak boleh berisi `service_role` key Supabase atau
  `Server Key` Midtrans — keduanya hanya dipakai di Edge Functions
  (lewat `supabase secrets set`, bukan di kode/env frontend).
- Route `/admin/*` dilindungi `ProtectedRoute`: butuh login DAN role
  `admin` di tabel `profiles`.
- `/login` dan `/signup` sengaja tidak ada di Navbar — hanya bisa
  diakses dengan mengetik URL langsung. Catatan: ini "security by
  obscurity" doang buat portofolio; siapa pun yang tahu/menebak URL
  tetap bisa signup jadi user biasa (perannya `user`, bukan `admin`,
  jadi tetap gak bisa masuk `/admin`). Kalau nanti dipakai serius,
  pertimbangkan tutup signup publik total dan buat akun admin manual
  dari Supabase Dashboard.
- `create-transaction` selalu ambil ulang harga produk dari database
  — harga yang dikirim dari browser tidak pernah dipakai langsung.
- `midtrans-webhook` memverifikasi `signature_key` (SHA-512) sebelum
  memproses apa pun; request dengan signature salah ditolak (403), dan
  ada cross-check tambahan `gross_amount` vs `total_amount` di DB.
- Order yang statusnya sudah final (`paid`/`failed`/`expired`) tidak
  bisa diubah lagi oleh notifikasi webhook susulan.
- Rate limiting dasar (lihat `03_security_hardening.sql`) buat
  `create-transaction` dan lookup QR publik — bukan proteksi DDoS
  kelas production, tapi cukup buat cegah abuse iseng di portofolio.

## Checklist keamanan Step 11 (jalankan sebelum "beneran" deploy)

- [ ] Jalankan `01_supabase_schema.sql` → `02_grants.sql` →
      `03_security_hardening.sql` berurutan di SQL Editor.
- [ ] `supabase secrets set MIDTRANS_SERVER_KEY=...` (jangan pernah
      taruh di kode/env frontend).
- [ ] `supabase secrets set RESEND_API_KEY=...` dan
      `FRONTEND_URL=https://domain-netlify-kamu.app`.
- [ ] `supabase secrets set ALLOWED_ORIGIN=https://domain-netlify-kamu.app`
      (kalau belum di-set, CORS masih `*` — cek log Edge Function buat
      warning-nya).
- [ ] Deploy ulang kedua Edge Function setelah set secrets baru:
      `supabase functions deploy create-transaction` &
      `supabase functions deploy midtrans-webhook --no-verify-jwt`.
- [ ] Di Supabase Auth settings: nonaktifkan "Enable email confirmations"
      kalau mau signup langsung bisa login, ATAU biarkan aktif kalau
      mau ada verifikasi email dulu (keduanya valid, tinggal pilih
      sesuai kebutuhan demo kamu).
- [ ] Di Supabase Auth settings: set **Site URL** & **Redirect URLs**
      ke domain Netlify kamu (bukan `localhost`) sebelum production.
- [ ] Jadikan minimal 1 akun admin manual:
      `update public.profiles set role = 'admin' where email = '...';`
- [ ] Netlify: set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_MIDTRANS_CLIENT_KEY` (root directory `food-app`, `netlify.toml`
      di repo ini sudah nyetel build command + security headers).
- [ ] Midtrans Dashboard (Sandbox) → daftarkan Payment Notification
      URL ke `https://<project-ref>.supabase.co/functions/v1/midtrans-webhook`.
- [ ] (Opsional, kalau mau lebih jauh) tambah CAPTCHA (mis. Cloudflare
      Turnstile) di form Checkout & Signup — rate limiting di
      `03_security_hardening.sql` menahan abuse ringan, tapi gak
      menggantikan CAPTCHA buat bot yang lebih serius.
- [ ] Bersihkan tabel `rate_limits` dari waktu ke waktu dengan
      `select public.cleanup_rate_limits();` (manual, atau jadwalkan
      lewat Supabase Cron kalau available di plan kamu).

## Troubleshooting

### Email QR (setelah bayar) gak nyampe, padahal email verifikasi signup nyampe

Dua email ini dikirim lewat jalur yang beda sama sekali:
- Email verifikasi signup → dikirim oleh **Supabase Auth** sendiri.
- Email "pembayaran berhasil" (link QR) → dikirim oleh **kode kamu**
  di `midtrans-webhook`, lewat **Resend API**.

Kalau yang pertama jalan tapi yang kedua enggak, cek berurutan:

1. **Apakah `midtrans-webhook` beneran ke-panggil?** Buka Supabase
   Dashboard > Edge Functions > `midtrans-webhook` > Logs, pas abis
   coba bayar di sandbox. Kalau LOG-NYA KOSONG SAMA SEKALI (gak ada
   invocation baru), berarti Midtrans gak pernah manggil webhook kamu
   — biasanya karena **Payment Notification URL belum didaftarkan**
   di Midtrans Dashboard (Sandbox) > Settings > Configuration, harus:
   ```
   https://<project-ref>.supabase.co/functions/v1/midtrans-webhook
   ```
2. **Kalau ada log tapi ada error** — baca pesannya. Kalau soal
   signature/permission, cek lagi `MIDTRANS_SERVER_KEY` dan grant
   `service_role` (lihat `04_grant_service_role.sql`).
3. **Kalau log-nya normal, gak ada error, tapi email tetap gak
   nyampe** — ini kemungkinan besar **batasan mode sandbox Resend**:
   selama domain kamu belum di-verify di Resend Dashboard > Domains,
   alamat pengirim `onboarding@resend.dev` **HANYA BISA ngirim ke
   alamat email akun Resend kamu sendiri** (yang kamu pakai daftar
   Resend), bukan ke email pelanggan sembarang. Jadi kalau kamu
   checkout pakai email lain (`geminidotme@gmail.com` misalnya) dan
   itu bukan email akun Resend kamu, Resend akan diam-diam gak
   ngirim (Resend API tetap balikin `ok`, tapi email gak beneran
   nyampe ke luar). Solusinya salah satu:
   - Testing: checkout pakai email yang sama dengan akun Resend kamu.
   - Production: verify domain kamu sendiri di Resend Dashboard >
     Domains, terus ganti `EMAIL_FROM` di
     `supabase/functions/_shared/email.ts` dari
     `onboarding@resend.dev` ke alamat di domain kamu (mis.
     `no-reply@dapuribu.com`), lalu deploy ulang function-nya.
4. Pastikan juga `RESEND_API_KEY` dan `FRONTEND_URL` sudah di-set
   lewat `supabase secrets set` (lihat bagian "Deploy Edge Functions"
   di atas) — kalau belum, log `midtrans-webhook` akan bilang
   `RESEND_API_KEY belum di-set`.

### Link verifikasi email malah ke `localhost`

Ini murni pengaturan di Supabase Dashboard, bukan kode. Buka
**Authentication > URL Configuration**:
- **Site URL** → ganti dari default (biasanya `http://localhost:3000`)
  ke domain Netlify kamu, mis. `https://dapur-ibu.netlify.app`.
- **Redirect URLs** → tambahkan domain yang sama (dan
  `http://localhost:5173` kalau kamu juga masih testing lokal pakai
  `npm run dev`), supaya `emailRedirectTo` yang sekarang dikirim dari
  `Signup.jsx` beneran diizinkan Supabase, bukan ditolak/dikembalikan
  ke Site URL default.

### Email masuk folder Spam

Ini soal reputasi domain pengirim, bukan isi kode. Penyebab utamanya:
selama `EMAIL_FROM` masih pakai `onboarding@resend.dev`, kamu ngirim
dari **domain bersama** milik Resend yang dipakai ribuan akun lain —
Gmail/dkk gak punya cara memastikan domain itu "milik" Dapur Ibu, jadi
wajar sering ditandai mencurigakan.

Perbaikan yang paling berdampak:

1. Buka **Resend Dashboard > Domains > Add Domain**, masukin domain
   kamu sendiri (mis. `dapuribu.com` — boleh domain yang sama dengan
   yang kamu pakai di Netlify, atau subdomain, bebas).
2. Resend kasih 2-3 DNS record (biasanya TXT untuk SPF, CNAME untuk
   DKIM, kadang TXT untuk DMARC). Tambahin persis itu di pengaturan
   DNS domain kamu (di registrar tempat beli domain, atau di Netlify
   DNS/Cloudflare kalau DNS-nya di situ).
3. Tunggu sampai status domain di Resend jadi **Verified** (biasanya
   beberapa menit sampai beberapa jam, tergantung propagasi DNS).
4. Ganti `EMAIL_FROM` di `supabase/functions/_shared/email.ts` dari
   `onboarding@resend.dev` ke alamat di domain kamu sendiri, mis.
   `Dapur Ibu <no-reply@dapuribu.com>`, lalu deploy ulang:
   ```bash
   supabase functions deploy midtrans-webhook --no-verify-jwt
   ```

Tanpa domain kamu sendiri yang ke-verify, secara teknis emang gak ada
cara lain buat menjamin email selalu masuk Inbox — semua provider
email (Gmail, Outlook, dst) makin ketat soal ini dari tahun ke tahun.

### Setelah pull kode terbaru, jangan lupa deploy ulang

- Perubahan di `src/` (React) → build ulang & deploy ke **Netlify**
  (push ke GitHub kalau auto-deploy, atau `npm run build` manual).
- Perubahan di `supabase/functions/` (Edge Functions, termasuk
  `email.ts`) → deploy ulang lewat Supabase CLI:
  ```bash
  supabase functions deploy create-transaction
  supabase functions deploy midtrans-webhook --no-verify-jwt
  ```
- Perubahan di file `.sql` → jalankan manual di SQL Editor.

Kalau fitur baru "kelihatan belum jalan" padahal kodenya udah diubah,
99% karena salah satu dari 3 langkah deploy di atas kelewat.
