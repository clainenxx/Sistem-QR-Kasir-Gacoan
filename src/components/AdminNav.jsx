import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Nav khusus halaman admin. Dipakai di dalam AdminLayout (App.jsx),
// TIDAK dipakai di halaman publik. Beda dari Navbar publik: gak ada
// keranjang, ada tombol "Keluar", dan link balik ke situs publik.
const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/transactions', label: 'Transaksi' },
  { to: '/admin/products/new', label: 'Tambah Produk' },
  { to: '/admin/scanner', label: 'Scanner QR' },
]

export default function AdminNav() {
  const { profile, signOut } = useAuth()

  return (
    <header className="border-b border-cream/10">
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-3 md:justify-start md:gap-4">
          <span className="font-display text-base sm:text-lg font-semibold whitespace-nowrap">
            Dapur Ibu — Admin
          </span>

          {/* Aksi kanan pindah ke sini (satu baris sama judul) khusus mobile,
              supaya gak ada baris ketiga yang makan tempat vertikal. */}
          <div className="flex items-center gap-2 text-sm text-cream/70 md:hidden">
            <Link to="/" className="hover:text-cream underline whitespace-nowrap">
              Lihat situs
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="px-3 py-1.5 rounded-full border border-cream/30 hover:bg-cream/10 transition whitespace-nowrap"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Nav link di-scroll horizontal di layar sempit biar gak wrap
            jadi berbaris-baris dan gak ke-cut di device kecil. */}
        <nav className="flex items-center gap-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `text-sm px-3 py-1.5 rounded-full transition whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-cream text-ink'
                    : 'text-cream/70 hover:text-cream hover:bg-cream/10'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3 text-sm text-cream/70">
          {profile?.email && <span className="hidden lg:inline">{profile.email}</span>}
          <Link to="/" className="hover:text-cream underline">
            Lihat situs
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="px-3 py-1.5 rounded-full border border-cream/30 hover:bg-cream/10 transition"
          >
            Keluar
          </button>
        </div>
      </div>
    </header>
  )
}
