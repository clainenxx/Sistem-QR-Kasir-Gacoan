// supabase/functions/midtrans-webhook/index.ts
//
// Ini endpoint "Payment Notification URL" yang didaftarkan di
// Midtrans Dashboard (Sandbox) > Settings > Configuration, contoh:
//   https://<project-ref>.supabase.co/functions/v1/midtrans-webhook
//
// PENTING — WAJIB DIMATIKAN JWT VERIFICATION untuk function ini
// (lihat supabase/config.toml: verify_jwt = false), karena Midtrans
// manggil endpoint ini langsung TANPA Supabase JWT. Keamanan endpoint
// ini BUKAN dari JWT, tapi dari verifikasi `signature_key` di bawah —
// kalau signature-nya gak cocok, request ditolak (403), titik.
//
// Signature Midtrans:
//   signature_key HARUS SAMA DENGAN
//   SHA512(order_id + status_code + gross_amount + ServerKey)
//
// Alur status:
//   'capture' (fraud_status 'accept') atau 'settlement' -> paid
//   'pending'                                            -> tetap pending (no-op)
//   'deny' / 'cancel' / 'capture' (fraud 'challenge')     -> failed
//   'expire'                                              -> expired
//
// Order yang statusnya sudah final (bukan 'pending') TIDAK diubah lagi
// walau ada notifikasi susulan — mencegah notifikasi telat/duplikat
// membalikkan status yang sudah benar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPaymentSuccessEmail, sendPaymentFailedEmail } from '../_shared/email.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const notification = await req.json().catch(() => null)
    if (!notification) {
      return new Response('Invalid payload', { status: 400 })
    }

    const {
      order_id: midtransOrderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
      fraud_status: fraudStatus,
      payment_type: paymentType,
    } = notification

    if (!midtransOrderId || !statusCode || !grossAmount || !signatureKey) {
      return new Response('Missing required fields', { status: 400 })
    }

    const midtransServerKey = Deno.env.get('MIDTRANS_SERVER_KEY')
    if (!midtransServerKey) {
      console.error('MIDTRANS_SERVER_KEY belum di-set.')
      return new Response('Server misconfigured', { status: 500 })
    }

    // ---- Verifikasi signature — INI YANG BIKIN ENDPOINT INI AMAN ----
    const raw = `${midtransOrderId}${statusCode}${grossAmount}${midtransServerKey}`
    const expectedSignature = await sha512Hex(raw)

    if (expectedSignature !== signatureKey) {
      console.error('Signature Midtrans tidak cocok — request ditolak.')
      return new Response('Invalid signature', { status: 403 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, customer_name, customer_email, total_amount, qr_token')
      .eq('midtrans_order_id', midtransOrderId)
      .single()

    if (fetchError || !order) {
      console.error('Order tidak ditemukan untuk midtrans_order_id:', midtransOrderId)
      // Tetap balas 200 supaya Midtrans gak retry berkali-kali buat
      // order yang memang gak pernah ada di sistem kita.
      return new Response('Order not found', { status: 200 })
    }

    if (order.status !== 'pending') {
      // Sudah final (paid/failed/expired) — abaikan notifikasi susulan.
      return new Response('OK (already final)', { status: 200 })
    }

    // ---- Cross-check jumlah (defense-in-depth) ----
    // Signature sudah mengikat gross_amount, jadi secara kriptografis
    // notifikasi ini memang datang dari Midtrans dengan angka itu.
    // Tapi kalau angkanya beda dari total_amount yang kita hitung
    // sendiri waktu create-transaction, itu tanda ada yang aneh (bug,
    // race condition, atau harga produk berubah di tengah jalan) —
    // dicatat sebagai warning, order tetap diproses sesuai status
    // Midtrans (uangnya memang sudah diterima/tidak, apa pun yang
    // terjadi di database kita).
    const grossAmountNum = Number(grossAmount)
    if (Math.abs(grossAmountNum - Number(order.total_amount)) > 0.5) {
      console.warn(
        `PERINGATAN: gross_amount Midtrans (${grossAmountNum}) tidak sama dengan total_amount order (${order.total_amount}) untuk order ${order.id}. Cek manual.`
      )
    }

    const isPaid =
      (transactionStatus === 'capture' && fraudStatus === 'accept') ||
      transactionStatus === 'settlement'

    const isFailed =
      transactionStatus === 'deny' ||
      transactionStatus === 'cancel' ||
      (transactionStatus === 'capture' && fraudStatus === 'challenge')

    const isExpired = transactionStatus === 'expire'

    if (isPaid) {
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_type: paymentType ?? null,
          qr_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', order.id)

      // Kirim email "pembayaran berhasil" + link QR. Kalau pengiriman
      // gagal (mis. RESEND_API_KEY belum di-set), kita cuma log —
      // status order TETAP 'paid' karena pembayarannya memang sudah
      // sukses di Midtrans; jangan sampai gagal kirim email
      // menggagalkan seluruh webhook (Midtrans akan retry & bikin
      // dobel kalau kita balikin error di sini).
      const emailResult = await sendPaymentSuccessEmail({
        to: order.customer_email,
        customerName: order.customer_name,
        qrToken: order.qr_token,
        totalAmount: Number(order.total_amount),
      })
      if (!emailResult.ok) {
        console.error('Gagal kirim email sukses untuk order', order.id, emailResult.error)
      }
    } else if (isFailed || isExpired) {
      await supabase
        .from('orders')
        .update({
          status: isExpired ? 'expired' : 'failed',
          payment_type: paymentType ?? null,
          expired_email_sent: true,
        })
        .eq('id', order.id)

      const emailResult = await sendPaymentFailedEmail({
        to: order.customer_email,
        customerName: order.customer_name,
        reason: isExpired ? 'expired' : 'failed',
      })
      if (!emailResult.ok) {
        console.error('Gagal kirim email gagal/expired untuk order', order.id, emailResult.error)
      }
    }
    // transactionStatus === 'pending' -> no-op, biarin tetap pending.

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response('Internal error', { status: 500 })
  }
})

async function sha512Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-512', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
