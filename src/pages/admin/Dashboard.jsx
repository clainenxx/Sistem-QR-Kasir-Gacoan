import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/format'

// Ringkasan cepat buat admin. Semua query di sini boleh jalan karena
// RLS "admin can read all orders" (lihat 01_supabase_schema.sql) —
// kalau user yang login BUKAN admin, RLS otomatis balikin 0 baris,
// bukan error (jadi halaman ini aman diakses tanpa validasi tambahan
// di luar ProtectedRoute).
export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    paidOrders: 0,
    revenueToday: 0,
    revenueAllTime: 0,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function loadStats() {
      setLoading(true)
      setError('')

      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)

      const [totalRes, pendingRes, paidRes, revenueTodayRes, revenueAllRes] =
        await Promise.all([
          supabase.from('orders').select('id', { count: 'exact', head: true }),
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'paid'),
          supabase
            .from('orders')
            .select('total_amount')
            .eq('status', 'paid')
            .gte('created_at', startOfToday.toISOString()),
          supabase.from('orders').select('total_amount').eq('status', 'paid'),
        ])

      if (!mounted) return

      const anyError =
        totalRes.error ||
        pendingRes.error ||
        paidRes.error ||
        revenueTodayRes.error ||
        revenueAllRes.error

      if (anyError) {
        setError('Gagal memuat statistik. Coba muat ulang halaman.')
        setLoading(false)
        return
      }

      setStats({
        totalOrders: totalRes.count ?? 0,
        pendingOrders: pendingRes.count ?? 0,
        paidOrders: paidRes.count ?? 0,
        revenueToday: (revenueTodayRes.data ?? []).reduce(
          (sum, o) => sum + Number(o.total_amount),
          0
        ),
        revenueAllTime: (revenueAllRes.data ?? []).reduce(
          (sum, o) => sum + Number(o.total_amount),
          0
        ),
      })
      setLoading(false)
    }

    loadStats()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-6">Dashboard</h1>

      {error && (
        <div className="mb-6 text-sm bg-sambal/15 text-sambal rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-cream/60 text-sm">Memuat statistik...</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Pesanan" value={stats.totalOrders} />
          <StatCard
            label="Menunggu Pembayaran"
            value={stats.pendingOrders}
            accent="text-turmeric"
          />
          <StatCard
            label="Sudah Dibayar"
            value={stats.paidOrders}
            accent="text-daun"
          />
          <StatCard
            label="Pendapatan Hari Ini"
            value={formatPrice(stats.revenueToday)}
          />
          <StatCard
            label="Pendapatan Keseluruhan"
            value={formatPrice(stats.revenueAllTime)}
          />
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/admin/transactions"
          className="rounded-full bg-cream text-ink font-medium px-5 py-2.5 hover:bg-cream/90 transition"
        >
          Lihat Transaksi
        </Link>
        <Link
          to="/admin/products/new"
          className="rounded-full border border-cream/30 px-5 py-2.5 hover:bg-cream/10 transition"
        >
          Tambah Produk
        </Link>
        <Link
          to="/admin/scanner"
          className="rounded-full border border-cream/30 px-5 py-2.5 hover:bg-cream/10 transition"
        >
          Buka Scanner QR
        </Link>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent = 'text-cream' }) {
  return (
    <div className="bg-cream/5 border border-cream/10 rounded-2xl p-5">
      <p className="text-sm text-cream/60">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  )
}
