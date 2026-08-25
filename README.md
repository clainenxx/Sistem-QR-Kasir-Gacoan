# Dapur Ibu

Dapur Ibu adalah aplikasi pemesanan makanan sederhana. Pelanggan pilih menu, checkout, bayar lewat Midtrans, terus dapat QR code yang nanti ditunjukkan ke admin untuk pengambilan pesanan. Ada juga panel admin buat kelola produk, pantau transaksi, dan scan QR pelanggan.

Ini proyek portofolio pribadi. Beberapa detail implementasi keamanan dan seluruh kredensial sengaja tidak saya sertakan di sini.

## Fitur

- Katalog menu dan halaman detail produk
- Keranjang belanja yang muncul mengambang di semua halaman publik
- Checkout dengan Midtrans Snap
- Setelah bayar, pelanggan dapat QR code unik yang berlaku 24 jam
- Halaman status pesanan yang update otomatis begitu pembayaran masuk
- Notifikasi email untuk pembayaran berhasil maupun gagal/kedaluwarsa
- Panel admin: dashboard statistik, daftar transaksi, tambah produk, dan scanner QR untuk redeem pesanan

## Tech stack

Frontend: React, Vite, Tailwind CSS, Zustand untuk state keranjang.

Backend: Supabase (database Postgres, auth, storage, edge functions), Midtrans Snap untuk pembayaran, Resend untuk email transaksional, Netlify untuk hosting.

## Cara kerja singkat

Frontend ambil data produk langsung dari Supabase, dibatasi lewat Row Level Security. Proses yang lebih sensitif seperti pembuatan transaksi dan verifikasi notifikasi pembayaran dari Midtrans dijalankan lewat Supabase Edge Functions, bukan dari browser. Harga yang dipakai saat checkout selalu diambil ulang dari database, bukan dari data yang dikirim browser, supaya tidak bisa dimanipulasi dari sisi client.

Begitu pembayaran terverifikasi, sistem generate QR code yang mengarah ke halaman status pesanan. Admin tinggal scan QR itu lewat panel admin untuk menandai pesanan sudah diambil.

## Menjalankan di lokal

```bash
git clone https://github.com/<username>/<nama-repo>.git
cd <nama-repo>
npm install
cp .env.example .env
```

Isi `.env` dengan kredensial Supabase dan Midtrans sandbox kamu sendiri, lalu jalankan:

```bash
npm run dev
```

Edge functions di folder `supabase/functions` di-deploy lewat Supabase CLI, dengan secret (Midtrans server key, Resend API key, dan lainnya) di-set lewat `supabase secrets set`, bukan lewat file `.env` frontend.

## Struktur folder

```
src/
  components/   Navbar, ProtectedRoute, CartPopup
  context/      auth context (session dan role user)
  store/        state keranjang
  lib/          helper Supabase, Midtrans, format
  pages/        halaman publik
  pages/admin/  halaman admin, dilindungi ProtectedRoute

supabase/
  functions/    edge functions (create-transaction, midtrans-webhook)
```

## Soal keamanan

Repo ini publik untuk keperluan portofolio, jadi beberapa hal saya batasi:

- Kredensial asli tidak ikut di-commit, pakai `.env.example` sebagai acuan
- Service role key dan server key pihak ketiga hanya ada di Edge Functions, tidak pernah di kode frontend
- Notifikasi pembayaran dari Midtrans diverifikasi lewat signature sebelum diproses
- Ada rate limiting dasar dan validasi input di sisi server, bukan cuma di form
- Detail lengkap struktur database ada di file SQL dalam folder `supabase`, silakan review sebelum reuse

## Author

Dibuat oleh [Nama kamu]. Portofolio: isi link. LinkedIn: isi link.
