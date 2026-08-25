import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { formatPrice } from '../lib/format'

// Halaman PUBLIK (tanpa login), diakses lewat /order/:token.
// :token adalah orders.qr_token (uuid) — dipakai sebagai "kunci" akses,
// bukan orders.id, supaya orang gak bisa nebak-nebak order lain lewat
// URL berurutan.
//
// Data diambil lewat 2 RPC security definer (dibuat di STEP 1):
//   get_order_by_qr_token(p_token)       -> detail order
//   get_order_items_by_qr_token(p_token) -> item-item order
// RPC ini sengaja gak lewat SELECT langsung ke tabel `orders` karena
// tabel itu tidak punya policy SELECT untuk anon/user biasa.
//
// Order baru berstatus 'pending' begitu dibuat di create-transaction,
// dan baru jadi 'paid' setelah Midtrans mengirim notifikasi ke
// midtrans-webhook (async, biasanya dalam beberapa detik). Snap
// onSuccess/onPending di halaman Checkout bisa saja lebih cepat sampai
// di browser user daripada webhook itu — makanya halaman ini POLLING
// tiap beberapa detik selama status masih 'pending', supaya begitu
// webhook selesai memproses, tampilan QR otomatis muncul tanpa perlu
// refresh manual.
// Polling dibagi 2 fase:
//   1. Selagi status masih 'pending' — nunggu webhook Midtrans update
//      status jadi paid/failed/expired. Interval cepat (4 detik),
//      timeout pendek (2 menit) karena user biasanya nunggu di depan
//      layar tepat setelah bayar.
//   2. Begitu status 'paid' TAPI belum di-redeem — nunggu admin scan
//      QR di kasir. Interval lebih santai (7 detik), timeout lebih
//      panjang (20 menit) supaya kalau user nungguin di kasir sambil
//      halaman ini kebuka, begitu admin scan, halaman auto-update
//      tanpa perlu refresh manual.
// Begitu order sudah final & redeemed (atau expired), polling stop.
const POLL_INTERVAL_PENDING_MS = 4000
const POLL_INTERVAL_WATCH_REDEEM_MS = 7000
const POLL_TIMEOUT_PENDING_MS = 2 * 60 * 1000
const POLL_TIMEOUT_WATCH_REDEEM_MS = 20 * 60 * 1000

export default function OrderQR() {
  const { token } = useParams()

  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState('')

  const pollTimerRef = useRef(null)
  const pollStartRef = useRef(null)

  useEffect(() => {
    let mounted = true
    pollStartRef.current = Date.now()

    async function fetchOrder({ silent } = { silent: false }) {
      if (!silent) {
        setLoading(true)
        setFetchError('')
      }

      const [orderRes, itemsRes] = await Promise.all([
        supabase.rpc('get_order_by_qr_token', { p_token: token }),
        supabase.rpc('get_order_items_by_qr_token', { p_token: token }),
      ])

      if (!mounted) return

      if (orderRes.error) {
        setFetchError('Gagal memuat data pesanan. Coba muat ulang halaman.')
        setLoading(false)
        return
      }

      const orderRow = orderRes.data?.[0]

      if (!orderRow) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setOrder(orderRow)
      setItems(itemsRes.data || [])
      setLoading(false)

      const elapsed = Date.now() - pollStartRef.current
      const isExpiredNow =
        orderRow.status === 'paid' &&
        orderRow.qr_expires_at &&
        new Date(orderRow.qr_expires_at) < new Date()

      let nextInterval = null // null = stop polling

      if (orderRow.status === 'pending' && elapsed < POLL_TIMEOUT_PENDING_MS) {
        nextInterval = POLL_INTERVAL_PENDING_MS
      } else if (
        orderRow.status === 'paid' &&
        !orderRow.redeemed &&
        !isExpiredNow &&
        elapsed < POLL_TIMEOUT_WATCH_REDEEM_MS
      ) {
        nextInterval = POLL_INTERVAL_WATCH_REDEEM_MS
      }

      if (nextInterval) {
        pollTimerRef.current = setTimeout(
          () => fetchOrder({ silent: true }),
          nextInterval
        )
      }
    }

    fetchOrder()

    return () => {
      mounted = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [token])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-char">
        Memuat pesanan...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-char px-4 text-center">
        <p>Pesanan tidak ditemukan. Cek kembali link di email kamu.</p>
        <Link to="/" className="text-sambal font-medium hover:underline">
          Kembali ke menu
        </Link>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-char px-4 text-center">
        <p>{fetchError}</p>
      </div>
    )
  }

  const isExpired =
    order.status === 'paid' &&
    order.qr_expires_at &&
    new Date(order.qr_expires_at) < new Date()

  return (
    <div className="max-w-md mx-auto px-4 py-10 pb-24">
      <div className="bg-white/60 border border-ink/10 rounded-2xl p-6">
        <h1 className="font-display text-2xl font-semibold text-ink text-center">
          Status Pesanan
        </h1>
        <p className="text-center text-sm text-char mt-1">
          {order.customer_name}
        </p>

        <div className="mt-6 flex justify-center">
          <StatusBadge status={order.status} expired={isExpired} />
        </div>

        {order.status === 'pending' && (
          <p className="mt-4 text-center text-sm text-char">
            Menunggu konfirmasi pembayaran dari Midtrans. Halaman ini akan
            update otomatis begitu pembayaran terverifikasi — tidak perlu
            ditutup.
          </p>
        )}

        {order.status === 'failed' && (
          <p className="mt-4 text-center text-sm text-char">
            Pembayaran gagal atau dibatalkan. Silakan pesan ulang dari menu.
          </p>
        )}

        {order.status === 'expired' && (
          <p className="mt-4 text-center text-sm text-char">
            Waktu pembayaran sudah habis. Silakan pesan ulang dari menu.
          </p>
        )}

        {order.status === 'paid' && isExpired && !order.redeemed && (
          <p className="mt-4 text-center text-sm text-char">
            QR pesanan ini sudah kedaluwarsa (berlaku 24 jam sejak
            pembayaran).
          </p>
        )}

        {order.status === 'paid' && !isExpired && (
          <>
            {order.redeemed ? (
              // QR sudah discan admin di kasir — tunjukkan status ini
              // dengan jelas (bukan cuma teks kecil) supaya pelanggan
              // yakin pesanannya sudah diambil, dan sembunyikan QR-nya
              // karena sudah gak relevan discan lagi.
              <div className="mt-6 flex flex-col items-center gap-2">
                <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-daun/15 text-daun text-sm font-medium">
                  ✓ Pesanan sudah diambil
                </span>
                {order.redeemed_at && (
                  <p className="text-center text-xs text-char/70">
                    Discan pada{' '}
                    {new Date(order.redeemed_at).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* QR berisi FULL URL (bukan token mentah) supaya kamera HP
                    biasa juga bisa buka halaman ini. Admin Scanner harus
                    mem-parsing token dari akhir URL ini, bukan menganggap
                    isi QR = uuid polos. */}
                <div className="mt-6 flex justify-center">
                  <div className="bg-white p-4 rounded-xl border border-ink/10">
                    <QRCodeSVG
                      value={`${window.location.origin}/order/${token}`}
                      size={200}
                    />
                  </div>
                </div>
                <p className="mt-3 text-center text-xs text-char">
                  Tunjukkan QR ini ke kasir saat pengambilan pesanan.
                  Halaman ini update otomatis begitu QR discan.
                </p>
              </>
            )}
            {order.qr_expires_at && (
              <p className="mt-1 text-center text-xs text-char/70">
                Berlaku sampai{' '}
                {new Date(order.qr_expires_at).toLocaleString('id-ID', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </>
        )}

        <div className="border-t border-ink/10 mt-6 pt-4">
          <h2 className="text-sm font-medium text-char mb-2">
            Rincian pesanan
          </h2>
          <ul className="space-y-1.5">
            {items.map((item, idx) => (
              <li
                key={idx}
                className="flex justify-between text-sm gap-3"
              >
                <span className="text-ink">
                  {item.product_name}{' '}
                  <span className="text-char">× {item.quantity}</span>
                </span>
                <span className="text-ink flex-shrink-0">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-sm font-medium mt-3 pt-3 border-t border-ink/10">
            <span className="text-ink">Total</span>
            <span className="text-sambal">
              {formatPrice(order.total_amount)}
            </span>
          </div>
        </div>
      </div>

      <div className="text-center mt-6">
        <Link to="/" className="text-sm text-char hover:text-ink underline">
          Kembali ke menu
        </Link>
      </div>
    </div>
  )
}

function StatusBadge({ status, expired }) {
  const map = {
    pending: { label: 'Menunggu Pembayaran', className: 'bg-turmeric/20 text-turmeric' },
    paid: expired
      ? { label: 'Kedaluwarsa', className: 'bg-char/15 text-char' }
      : { label: 'Sudah Dibayar', className: 'bg-daun/15 text-daun' },
    failed: { label: 'Gagal', className: 'bg-sambal/15 text-sambal' },
    expired: { label: 'Kedaluwarsa', className: 'bg-char/15 text-char' },
  }

  const badge = map[status] || { label: status, className: 'bg-char/15 text-char' }

  return (
    <span
      className={`px-4 py-1.5 rounded-full text-sm font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  )
}
