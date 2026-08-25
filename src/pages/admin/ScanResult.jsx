import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/format'

// Halaman ini dituju SETELAH Scanner.jsx berhasil redeem QR (status
// 'ok' atau 'already_redeemed') — bukan diakses langsung dari menu.
// Data order biasanya sudah dikirim lewat `location.state` (supaya
// langsung tampil tanpa nunggu network sekali lagi), tapi kalau
// halaman ini diakses ulang (mis. admin klik tombol Back browser),
// kita fallback ambil ulang datanya dari RPC pakai :token di URL.
export default function AdminScanResult() {
  const { token } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const initialState = location.state || null

  const [status, setStatus] = useState(initialState?.status || null)
  const [order, setOrder] = useState(initialState?.order || null)
  const [items, setItems] = useState(initialState?.items || [])
  const [loading, setLoading] = useState(!initialState)

  useEffect(() => {
    if (initialState) return // sudah ada data dari navigate(), gak perlu fetch ulang

    let mounted = true
    async function loadFallback() {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.rpc('get_order_by_qr_token', { p_token: token }),
        supabase.rpc('get_order_items_by_qr_token', { p_token: token }),
      ])
      if (!mounted) return

      const orderRow = orderRes.data?.[0]
      setOrder(orderRow || null)
      setItems(itemsRes.data || [])
      setStatus(orderRow?.redeemed ? 'already_redeemed' : null)
      setLoading(false)
    }
    loadFallback()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-cream/60">
        Memuat detail pesanan...
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-cream/70">Detail pesanan tidak ditemukan.</p>
        <button
          type="button"
          onClick={() => navigate('/admin/scanner')}
          className="mt-6 rounded-full bg-cream text-ink font-medium px-6 py-2.5 hover:bg-cream/90 transition"
        >
          Kembali ke Scanner
        </button>
      </div>
    )
  }

  const isFirstScan = status === 'ok'

  return (
    <div className="max-w-md mx-auto py-6">
      <div className="flex flex-col items-center text-center">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl ${
            isFirstScan ? 'bg-daun/15 text-daun' : 'bg-turmeric/20 text-turmeric'
          }`}
        >
          ✓
        </div>
        <h1 className="font-display text-2xl font-semibold mt-4">
          {isFirstScan ? 'Pesanan Diambil' : 'QR Sudah Pernah Discan'}
        </h1>
        <p className="text-sm text-cream/60 mt-1">
          {isFirstScan
            ? 'Berhasil dicatat sebagai sudah diserahkan ke pelanggan.'
            : 'QR ini sebelumnya sudah pernah divalidasi — pesanan ini kemungkinan sudah diserahkan.'}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-cream/10 bg-cream/5 p-5">
        <p className="text-xs uppercase tracking-wide text-cream/40 mb-1">
          Pemesan
        </p>
        <p className="text-lg font-medium text-cream">{order.customer_name}</p>

        <div className="border-t border-cream/10 my-4" />

        <p className="text-xs uppercase tracking-wide text-cream/40 mb-2">
          Rincian Pesanan
        </p>
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex justify-between text-sm gap-3">
              <span className="text-cream/90">
                {item.product_name}{' '}
                <span className="text-cream/50">× {item.quantity}</span>
              </span>
              <span className="text-cream/90 flex-shrink-0">
                {formatPrice(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-cream/10 mt-4 pt-4 flex justify-between font-medium">
          <span className="text-cream">Total</span>
          <span className="text-cream">{formatPrice(order.total_amount)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/scanner')}
          className="w-full rounded-full bg-cream text-ink font-medium py-2.5 hover:bg-cream/90 transition"
        >
          Scan Pesanan Berikutnya
        </button>
        <Link
          to="/admin/transactions"
          className="text-center text-sm text-cream/60 hover:text-cream underline"
        >
          Lihat semua transaksi
        </Link>
      </div>
    </div>
  )
}
