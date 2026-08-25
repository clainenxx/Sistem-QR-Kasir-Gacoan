// supabase/functions/create-transaction/index.ts
//
// Dipanggil dari Checkout.jsx (browser, pakai anon key lewat
// `supabase.functions.invoke`). JWT verification TETAP AKTIF di
// function ini (default) — anon key sudah cukup buat lolos verifikasi
// itu, jadi gak perlu diubah di config.toml.
//
// Tugas function ini:
//  1. Validasi input & AMBIL ULANG harga produk dari database —
//     harga dari client (browser) TIDAK PERNAH dipercaya, supaya
//     total_amount gak bisa dimanipulasi dari DevTools/network tab.
//  2. Insert order (status 'pending') + order_items (snapshot nama &
//     harga saat itu).
//  3. Minta snap_token ke Midtrans Snap API (sandbox) pakai Server Key.
//  4. Simpan snap_token & midtrans_order_id ke order, balikin
//     { snap_token, qr_token } ke client (kontrak yang dipakai
//     Checkout.jsx di step 6).
//
// Env yang WAJIB di-set manual (lihat README > Deploy Edge Functions):
//   supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
//
// Env berikut OTOMATIS tersedia di semua Edge Function Supabase,
// TIDAK perlu di-set manual:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// SANDBOX. Kalau nanti production, ganti ke:
// https://app.midtrans.com/snap/v1/transactions
const MIDTRANS_SNAP_URL =
  'https://app.sandbox.midtrans.com/snap/v1/transactions'

// Batas wajar biar gak bisa dipakai buat spam / DoS ke Midtrans API
// lewat 1 request checkout raksasa.
const MAX_ITEMS_PER_ORDER = 20
const MAX_QUANTITY_PER_ITEM = 50
const MAX_NAME_LENGTH = 200

interface RawItem {
  product_id?: unknown
  quantity?: unknown
}

interface NormalizedItem {
  product_id: string
  quantity: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json().catch(() => null)

    const customerName =
      typeof body?.customer_name === 'string' ? body.customer_name.trim() : ''
    const customerEmail =
      typeof body?.customer_email === 'string'
        ? body.customer_email.trim().toLowerCase()
        : ''
    const rawItems: RawItem[] = Array.isArray(body?.items) ? body.items : []

    if (!customerName || !customerEmail || rawItems.length === 0) {
      return jsonResponse(
        { error: 'customer_name, customer_email, dan items wajib diisi.' },
        400
      )
    }

    if (customerName.length > MAX_NAME_LENGTH) {
      return jsonResponse({ error: 'Nama terlalu panjang.' }, 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(customerEmail) || customerEmail.length > MAX_NAME_LENGTH) {
      return jsonResponse({ error: 'Format email tidak valid.' }, 400)
    }

    if (rawItems.length > MAX_ITEMS_PER_ORDER) {
      return jsonResponse(
        { error: `Maksimal ${MAX_ITEMS_PER_ORDER} jenis produk per pesanan.` },
        400
      )
    }

    const normalizedItems: NormalizedItem[] = []
    for (const raw of rawItems) {
      const productId = typeof raw?.product_id === 'string' ? raw.product_id : ''
      const quantity =
        typeof raw?.quantity === 'number'
          ? raw.quantity
          : parseInt(String(raw?.quantity ?? ''), 10)

      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > MAX_QUANTITY_PER_ITEM
      ) {
        return jsonResponse({ error: 'Item pesanan tidak valid.' }, 400)
      }
      normalizedItems.push({ product_id: productId, quantity })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const midtransServerKey = Deno.env.get('MIDTRANS_SERVER_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server belum dikonfigurasi.' }, 500)
    }
    if (!midtransServerKey) {
      return jsonResponse(
        { error: 'Server belum dikonfigurasi (MIDTRANS_SERVER_KEY kosong).' },
        500
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // ---- Rate limiting dasar (lihat 03_security_hardening.sql) ----
    // Dibatasi per EMAIL (cegah 1 orang spam checkout berkali-kali)
    // dan per IP (cegah 1 sumber bikin banyak order pakai email
    // beda-beda). Batas longgar karena orang wajar bisa aja checkout
    // ulang kalau salah isi form / mau pesan lagi.
    const clientIp = getClientIp(req)
    const { data: emailAllowed } = await supabase.rpc('check_rate_limit', {
      p_key: `order:email:${customerEmail}`,
      p_max_requests: 5,
      p_window_seconds: 600, // 5x / 10 menit
    })
    const { data: ipAllowed } = await supabase.rpc('check_rate_limit', {
      p_key: `order:ip:${clientIp}`,
      p_max_requests: 15,
      p_window_seconds: 600, // 15x / 10 menit
    })

    if (emailAllowed === false || ipAllowed === false) {
      return jsonResponse(
        { error: 'Terlalu banyak percobaan checkout. Coba lagi beberapa menit lagi.' },
        429
      )
    }

    // Ambil harga ASLI dari DB berdasarkan product_id yang dikirim —
    // bukan dari body request. Sekalian tolak produk yang gak ada
    // atau sudah is_active = false.
    const productIds = [...new Set(normalizedItems.map((i) => i.product_id))]
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, is_active')
      .in('id', productIds)

    if (productsError) {
      console.error(productsError)
      return jsonResponse({ error: 'Gagal mengambil data produk.' }, 500)
    }

    const productMap = new Map((products ?? []).map((p) => [p.id, p]))
    const orderItemsPayload: {
      product_id: string
      product_name: string
      price: number
      quantity: number
    }[] = []

    let totalAmount = 0
    for (const item of normalizedItems) {
      const product = productMap.get(item.product_id)
      if (!product || !product.is_active) {
        return jsonResponse(
          { error: 'Salah satu produk sudah tidak tersedia. Coba refresh keranjang.' },
          400
        )
      }
      const price = Number(product.price)
      totalAmount += price * item.quantity
      orderItemsPayload.push({
        product_id: product.id,
        product_name: product.name,
        price,
        quantity: item.quantity,
      })
    }

    if (totalAmount <= 0) {
      return jsonResponse({ error: 'Total pesanan tidak valid.' }, 400)
    }

    const midtransOrderId = `ORDER-${crypto.randomUUID()}`

    // 1) Insert order berstatus 'pending'. Kolom qr_token dibuat
    //    otomatis oleh default gen_random_uuid() (lihat
    //    01_supabase_schema.sql) — kita gak perlu generate manual.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName,
        customer_email: customerEmail,
        status: 'pending',
        total_amount: totalAmount,
        midtrans_order_id: midtransOrderId,
      })
      .select('id, qr_token')
      .single()

    if (orderError || !order) {
      console.error(orderError)
      return jsonResponse({ error: 'Gagal membuat order.' }, 500)
    }

    // 2) Insert order_items (snapshot nama & harga saat ini)
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItemsPayload.map((it) => ({
        order_id: order.id,
        product_id: it.product_id,
        product_name: it.product_name,
        price: it.price,
        quantity: it.quantity,
      }))
    )

    if (itemsError) {
      console.error(itemsError)
      // Order sudah kebuat tapi item-nya gagal — bersihkan lagi biar
      // gak nyangkut jadi order "pending" kosong tanpa isi.
      await supabase.from('orders').delete().eq('id', order.id)
      return jsonResponse({ error: 'Gagal menyimpan detail pesanan.' }, 500)
    }

    // 3) Minta snap_token ke Midtrans Snap API (sandbox)
    const midtransAuth = btoa(`${midtransServerKey}:`)
    const snapResponse = await fetch(MIDTRANS_SNAP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${midtransAuth}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: totalAmount,
        },
        customer_details: {
          first_name: customerName,
          email: customerEmail,
        },
        item_details: orderItemsPayload.map((it) => ({
          id: it.product_id,
          name: it.product_name.slice(0, 50), // Midtrans batasin max 50 char
          price: it.price,
          quantity: it.quantity,
        })),
      }),
    })

    const snapData = await snapResponse.json().catch(() => null)

    if (!snapResponse.ok || !snapData?.token) {
      console.error('Midtrans error:', snapData)
      // Rollback: order tanpa snap_token gak ada gunanya, hapus lagi.
      await supabase.from('order_items').delete().eq('order_id', order.id)
      await supabase.from('orders').delete().eq('id', order.id)
      return jsonResponse(
        {
          error:
            snapData?.error_messages?.[0] ??
            'Gagal membuat transaksi pembayaran. Coba lagi.',
        },
        502
      )
    }

    // 4) Simpan snap_token ke order (buat referensi/debug)
    await supabase
      .from('orders')
      .update({ snap_token: snapData.token })
      .eq('id', order.id)

    return jsonResponse({ snap_token: snapData.token, qr_token: order.qr_token })
  } catch (err) {
    console.error(err)
    return jsonResponse({ error: 'Terjadi kesalahan pada server.' }, 500)
  }
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Supabase Edge Functions jalan di belakang proxy, jadi IP asli client
// ada di header x-forwarded-for (ambil entri pertama = client asli,
// entri berikutnya kalau ada = hop proxy lain).
function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return 'unknown'
}
