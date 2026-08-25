import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/format'
import { ChevronDownIcon, ChevronUpIcon } from '../../components/icons'

const STATUS_FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'pending', label: 'Menunggu' },
  { value: 'paid', label: 'Dibayar' },
  { value: 'expired', label: 'Kedaluwarsa' },
  { value: 'failed', label: 'Gagal' },
]

const STATUS_BADGE = {
  pending: 'bg-turmeric/20 text-turmeric',
  paid: 'bg-daun/15 text-daun',
  failed: 'bg-sambal/15 text-sambal',
  expired: 'bg-cream/15 text-cream/70',
}

function qrStatusLabel(order) {
  if (order.status !== 'paid') return '—'
  if (order.redeemed) return 'Sudah discan'
  if (order.qr_expires_at && new Date(order.qr_expires_at) < new Date()) {
    return 'Kedaluwarsa'
  }
  return 'Belum discan'
}

// List order buat admin, bisa difilter per status. Klik satu baris
// (atau satu card di layar sempit) buat expand & lihat rincian item
// (di-fetch on-demand supaya gak nge-load semua order_items sekaligus
// kalau ordernya udah banyak).
export default function AdminTransactions() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [itemsLoading, setItemsLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadOrders() {
      setLoading(true)
      setError('')

      let query = supabase
        .from('orders')
        .select(
          'id, customer_name, customer_email, status, total_amount, redeemed, redeemed_at, qr_expires_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(200)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error: queryError } = await query

      if (!mounted) return

      if (queryError) {
        setError('Gagal memuat transaksi.')
        setOrders([])
      } else {
        setOrders(data || [])
      }
      setLoading(false)
    }

    loadOrders()
    return () => {
      mounted = false
    }
  }, [statusFilter])

  async function toggleExpand(orderId) {
    if (expandedId === orderId) {
      setExpandedId(null)
      return
    }

    setExpandedId(orderId)

    if (!itemsByOrder[orderId]) {
      setItemsLoading(true)
      const { data, error: itemsError } = await supabase
        .from('order_items')
        .select('product_name, price, quantity')
        .eq('order_id', orderId)

      if (!itemsError) {
        setItemsByOrder((prev) => ({ ...prev, [orderId]: data || [] }))
      }
      setItemsLoading(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-2xl font-semibold">Transaksi</h1>

        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`text-sm px-3 py-1.5 rounded-full transition ${
                statusFilter === f.value
                  ? 'bg-cream text-ink'
                  : 'text-cream/70 hover:text-cream hover:bg-cream/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm bg-sambal/15 text-sambal rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-cream/60 text-sm">Memuat transaksi...</p>
      ) : orders.length === 0 ? (
        <p className="text-cream/60 text-sm">Belum ada transaksi.</p>
      ) : (
        <>
          {/* Mobile / tablet sempit (< md): list card, satu order per baris.
              Tabel dengan 5 kolom fixed gak muat di layar HP tanpa scroll
              horizontal, jadi di breakpoint ini ganti jadi card. */}
          <div className="md:hidden space-y-3">
            {orders.map((order) => {
              const isExpanded = expandedId === order.id
              return (
                <div
                  key={order.id}
                  className="border border-cream/10 rounded-2xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(order.id)}
                    className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 active:bg-cream/5"
                  >
                    <div className="min-w-0">
                      <div className="text-cream truncate">
                        {order.customer_name}
                      </div>
                      <div className="text-cream/50 text-xs truncate">
                        {order.customer_email}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            STATUS_BADGE[order.status] ||
                            'bg-cream/15 text-cream/70'
                          }`}
                        >
                          {order.status}
                        </span>
                        <span className="text-cream/50 text-xs">
                          QR: {qrStatusLabel(order)}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <div className="text-cream font-medium">
                        {formatPrice(order.total_amount)}
                      </div>
                      <div className="text-cream/50 text-xs mt-1">
                        {new Date(order.created_at).toLocaleString('id-ID', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </div>
                      <div className="flex justify-end mt-1 text-cream/50">
                        {isExpanded ? (
                          <ChevronUpIcon size={16} />
                        ) : (
                          <ChevronDownIcon size={16} />
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-cream/[0.03] border-t border-cream/5 px-4 py-3">
                      {itemsLoading && !itemsByOrder[order.id] ? (
                        <p className="text-cream/50 text-xs">Memuat item...</p>
                      ) : (
                        <ul className="space-y-1">
                          {(itemsByOrder[order.id] || []).map((item, idx) => (
                            <li
                              key={idx}
                              className="flex justify-between text-xs text-cream/80 gap-3"
                            >
                              <span>
                                {item.product_name} × {item.quantity}
                              </span>
                              <span className="flex-shrink-0">
                                {formatPrice(item.price * item.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Tablet / desktop (md ke atas): tabel biasa. */}
          <div className="hidden md:block border border-cream/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream/5 text-cream/60 text-left">
                    <th className="px-4 py-3 font-medium">Pelanggan</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Waktu</th>
                    <th className="px-4 py-3 font-medium">QR</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <Fragment key={order.id}>
                      <tr
                        onClick={() => toggleExpand(order.id)}
                        className="border-t border-cream/10 cursor-pointer hover:bg-cream/5"
                      >
                        <td className="px-4 py-3">
                          <div className="text-cream">{order.customer_name}</div>
                          <div className="text-cream/50 text-xs">
                            {order.customer_email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              STATUS_BADGE[order.status] ||
                              'bg-cream/15 text-cream/70'
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-cream">
                          {formatPrice(order.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-cream/70 text-xs">
                          {new Date(order.created_at).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-4 py-3 text-cream/70 text-xs">
                          {qrStatusLabel(order)}
                        </td>
                      </tr>
                      {expandedId === order.id && (
                        <tr className="bg-cream/[0.03] border-t border-cream/5">
                          <td colSpan={5} className="px-4 py-3">
                            {itemsLoading && !itemsByOrder[order.id] ? (
                              <p className="text-cream/50 text-xs">
                                Memuat item...
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {(itemsByOrder[order.id] || []).map(
                                  (item, idx) => (
                                    <li
                                      key={idx}
                                      className="flex justify-between text-xs text-cream/80"
                                    >
                                      <span>
                                        {item.product_name} × {item.quantity}
                                      </span>
                                      <span>
                                        {formatPrice(
                                          item.price * item.quantity
                                        )}
                                      </span>
                                    </li>
                                  )
                                )}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
