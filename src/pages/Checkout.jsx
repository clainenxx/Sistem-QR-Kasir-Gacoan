import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { formatPrice } from '../lib/format'
import { loadMidtransSnap } from '../lib/midtrans'

// Kontrak dengan Edge Function "create-transaction" (dibangun di
// step 7):
//   REQUEST  body: { customer_name, customer_email, items: [{ product_id, quantity }] }
//   RESPONSE body: { snap_token, qr_token }
//
// Harga TIDAK dikirim dari sini — Edge Function yang ambil ulang
// harga dari tabel `products` pakai service_role, biar gak bisa
// dimanipulasi dari client. qr_token dipakai buat redirect ke
// halaman /order/:token begitu Snap kasih tau pembayaran
// sukses/pending.
export default function Checkout() {
  const navigate = useNavigate()
  const items = useCartStore((s) => s.items)
  const totalPrice = useCartStore((s) => s.totalPrice())
  const clearCart = useCartStore((s) => s.clearCart)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Preload Snap.js di awal supaya pas klik "Lanjut ke Pembayaran"
    // gak perlu nunggu script kebaca dulu. Gagal preload gak fatal,
    // nanti dicoba lagi otomatis pas submit.
    loadMidtransSnap().catch(() => {})
  }, [])

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-char px-4">
        <p>Keranjang kamu masih kosong.</p>
        <Link to="/" className="text-sambal font-medium hover:underline">
          Lihat menu
        </Link>
      </div>
    )
  }

  function validate() {
    if (!name.trim()) return 'Nama wajib diisi.'
    if (!email.trim()) return 'Email wajib diisi.'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) return 'Format email tidak valid.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'create-transaction',
        {
          body: {
            customer_name: name.trim(),
            customer_email: email.trim(),
            items: items.map((item) => ({
              product_id: item.productId,
              quantity: item.quantity,
            })),
          },
        }
      )

      if (fnError) throw fnError
      if (!data?.snap_token || !data?.qr_token) {
        throw new Error('Respons server tidak lengkap.')
      }

      const snap = await loadMidtransSnap()

      snap.pay(data.snap_token, {
        onSuccess: () => {
          clearCart()
          navigate(`/order/${data.qr_token}`)
        },
        onPending: () => {
          clearCart()
          navigate(`/order/${data.qr_token}`)
        },
        onError: () => {
          setSubmitting(false)
          setError('Pembayaran gagal diproses. Silakan coba lagi.')
        },
        onClose: () => {
          setSubmitting(false)
          // User nutup popup Snap tanpa nyelesain pembayaran — order
          // di database tetap berstatus "pending" (bisa dibayar lagi
          // via link di email, atau expired lewat batas waktu).
        },
      })
    } catch (err) {
      setSubmitting(false)
      const msg = err?.message || ''
      setError(
        msg.includes('Failed to fetch') || msg.includes('not found')
          ? 'Server pembayaran belum siap (Edge Function "create-transaction" belum di-deploy). Coba lagi nanti.'
          : msg || 'Terjadi kesalahan. Coba lagi.'
      )
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 pb-40">
      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        Checkout
      </h1>

      <div className="bg-white/60 border border-ink/10 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-medium text-char mb-3">
          Ringkasan pesanan
        </h2>
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex justify-between text-sm gap-3"
            >
              <span className="text-ink">
                {item.name}{' '}
                <span className="text-char">× {item.quantity}</span>
              </span>
              <span className="text-ink flex-shrink-0">
                {formatPrice(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink/10 mt-3 pt-3 flex justify-between font-medium">
          <span className="text-ink">Total</span>
          <span className="text-sambal">{formatPrice(totalPrice)}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="text-sm text-sambal bg-sambal/10 border border-sambal/20 rounded-lg px-3 py-2"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-char mb-1"
          >
            Nama
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
            placeholder="Nama kamu"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-char mb-1"
          >
            Email aktif
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
            placeholder="kamu@email.com"
          />
          <p className="mt-1 text-xs text-char">
            Link QR pesanan kamu akan dikirim ke email ini.
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-ink text-cream font-medium py-2.5 hover:bg-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Memproses...' : 'Lanjut ke Pembayaran'}
        </button>
      </form>
    </div>
  )
}
