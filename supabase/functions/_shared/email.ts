// supabase/functions/_shared/email.ts
//
// Helper kirim email pakai Resend API (https://resend.com), dipanggil
// dari midtrans-webhook. Server-side ONLY — RESEND_API_KEY gak pernah
// boleh nyampe ke browser/frontend.
//
// Env yang wajib di-set (supabase secrets set ...):
//   RESEND_API_KEY  -> API key dari Resend Dashboard > API Keys
//   FRONTEND_URL    -> contoh: https://dapur-ibu.netlify.app
//                      (dipakai buat bikin link /order/:token di email)
//
// CATATAN DELIVERABILITY (kenapa email bisa masuk folder Spam):
// Selama kamu masih pakai "from" bawaan `onboarding@resend.dev`,
// email KAMU DIKIRIM DARI DOMAIN BERSAMA milik Resend (dipakai
// ribuan akun lain juga) — provider email (Gmail dkk) gak punya cara
// buat percaya domain itu "milik" Dapur Ibu, jadi wajar sering
// dianggap mencurigakan / masuk Spam. Ini BUKAN soal isi emailnya.
//
// PERBAIKAN PALING BERDAMPAK: verify domain kamu sendiri di Resend
// Dashboard > Domains (tambahin domain kamu, lalu Resend kasih 2-3
// DNS record — SPF/TXT, DKIM/CNAME, kadang DMARC — yang perlu kamu
// tambahin di pengaturan DNS domain kamu, mis. di Netlify DNS/
// Cloudflare/registrar tempat beli domain). Begitu status domainnya
// "Verified" di Resend, ganti EMAIL_FROM di bawah ke alamat di domain
// kamu sendiri (mis. no-reply@dapuribu.com), lalu deploy ulang
// function-nya. Ini yang paling nentuin nyampe ke Inbox atau Spam,
// jauh lebih berpengaruh daripada isi/subjek emailnya.
//
// Sambil nunggu domain di-verify, hal kecil yang tetap membantu:
// - Subjek email dibuat jelas & gak "clickbait"/ALL CAPS (sudah).
// - Selalu sertakan versi plain-text (`text`), bukan cuma HTML —
//   email HTML-only tanpa alternatif teks lebih gampang ditandai
//   spam filter (sudah ditambahkan di bawah).
// - `reply_to` diisi alamat asli yang bisa dibalas, bukan no-reply
//   generik yang gak pernah dicek.

const RESEND_API_URL = 'https://api.resend.com/emails'

// Alamat yang bisa dibalas kalau customer punya pertanyaan soal
// pesanannya. Boleh sama dengan EMAIL_FROM kalau kamu memang mau
// terima balasan ke situ.
const REPLY_TO = 'no-reply@dapuribu.com'

// Ganti ke alamat di domain kamu sendiri setelah domain ke-verify,
// misal: 'Dapur Ibu <no-reply@dapuribu.com>'
const EMAIL_FROM = 'Dapur Ibu <onboarding@resend.dev>'

interface SendEmailResult {
  ok: boolean
  error?: string
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')

  if (!apiKey) {
    console.error('RESEND_API_KEY belum di-set — email tidak dikirim.')
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        html,
        text,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('Resend gagal kirim email:', res.status, body)
      return { ok: false, error: `Resend ${res.status}: ${body}` }
    }

    return { ok: true }
  } catch (err) {
    console.error('Resend fetch error:', err)
    return { ok: false, error: String(err) }
  }
}

// Email #1: pembayaran berhasil — dikirim begitu status order jadi 'paid'.
export async function sendPaymentSuccessEmail(params: {
  to: string
  customerName: string
  qrToken: string
  totalAmount: number
}): Promise<SendEmailResult> {
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? ''
  const orderUrl = `${frontendUrl}/order/${params.qrToken}`
  const formattedTotal = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(params.totalAmount)

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #201A17;">
      <h2 style="color: #D64545;">Pembayaran Berhasil 🎉</h2>
      <p>Halo ${escapeHtml(params.customerName)},</p>
      <p>Pesanan kamu sudah kami terima dan pembayaran sebesar
        <strong>${formattedTotal}</strong> sudah dikonfirmasi.</p>
      <p>Tunjukkan QR di halaman berikut ke kasir saat pengambilan
        pesanan. QR ini berlaku selama <strong>24 jam</strong>:</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${orderUrl}"
           style="background: #201A17; color: #FBF3E7; padding: 12px 24px;
                  border-radius: 999px; text-decoration: none; display: inline-block;">
          Lihat QR Pesanan
        </a>
      </p>
      <p style="font-size: 13px; color: #6B5B4D;">
        Atau buka link ini di browser: <br />${orderUrl}
      </p>
    </div>
  `

  // Versi plain-text — wajib disertakan (lihat catatan deliverability
  // di atas file ini), isinya sama, tanpa styling.
  const text = [
    `Halo ${params.customerName},`,
    '',
    `Pesanan kamu sudah kami terima dan pembayaran sebesar ${formattedTotal} sudah dikonfirmasi.`,
    '',
    'Tunjukkan QR di halaman berikut ke kasir saat pengambilan pesanan. QR ini berlaku selama 24 jam:',
    orderUrl,
  ].join('\n')

  return sendEmail(params.to, 'Pembayaran Berhasil — QR Pesanan Kamu', html, text)
}

// Email #2: pembayaran gagal / expired.
export async function sendPaymentFailedEmail(params: {
  to: string
  customerName: string
  reason: 'failed' | 'expired'
}): Promise<SendEmailResult> {
  const message =
    params.reason === 'expired'
      ? 'Waktu pembayaran untuk pesanan kamu sudah habis.'
      : 'Pembayaran untuk pesanan kamu gagal diproses.'

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #201A17;">
      <h2 style="color: #D64545;">Pembayaran Tidak Berhasil</h2>
      <p>Halo ${escapeHtml(params.customerName)},</p>
      <p>${message} Silakan kembali ke halaman menu untuk memesan ulang.</p>
    </div>
  `

  const text = [
    `Halo ${params.customerName},`,
    '',
    `${message} Silakan kembali ke halaman menu untuk memesan ulang.`,
  ].join('\n')

  return sendEmail(
    params.to,
    params.reason === 'expired'
      ? 'Waktu Pembayaran Habis'
      : 'Pembayaran Gagal',
    html,
    text
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
