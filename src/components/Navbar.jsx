import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCartStore } from '../store/cartStore'
import { ShoppingBagIcon, UtensilsIcon } from './icons'

export default function Navbar() {
  const { session, isAdmin } = useAuth()
  const totalItems = useCartStore((s) => s.totalItems())
  const toggleCart = useCartStore((s) => s.toggleCart)

  return (
    <header className="sticky top-0 z-40 bg-cream/85 backdrop-blur-md border-b border-ink/10">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-full bg-ink text-cream flex items-center justify-center">
            <UtensilsIcon size={16} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Dapur Ibu
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="#menu"
            className="hidden sm:inline text-sm font-medium text-char hover:text-ink transition px-2"
          >
            Menu
          </a>

          {session && isAdmin && (
            <Link
              to="/admin"
              className="text-sm font-medium px-4 py-2 rounded-full bg-ink text-cream hover:bg-ink/90 transition"
            >
              Admin
            </Link>
          )}

          <button
            type="button"
            onClick={toggleCart}
            aria-label="Buka keranjang"
            className="relative inline-flex items-center justify-center w-10 h-10 rounded-full text-ink hover:bg-ink/5 active:scale-95 transition"
          >
            <ShoppingBagIcon size={20} />
            {totalItems > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-sambal text-cream text-[10px] font-semibold rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center">
                {totalItems > 9 ? '9+' : totalItems}
              </span>
            )}
          </button>
        </div>
      </nav>
    </header>
  )
}
