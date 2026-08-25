import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { formatPrice } from '../lib/format'
import { ChevronDownIcon, ShoppingBagIcon } from './icons'

export default function CartPopup() {
  const items = useCartStore((s) => s.items)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const isOpen = useCartStore((s) => s.isCartOpen)
  const toggleCart = useCartStore((s) => s.toggleCart)
  const closeCart = useCartStore((s) => s.closeCart)
  const navigate = useNavigate()

  // Panel ini dipicu dari 2 tempat: klik bar bawah (kalau keranjang
  // sudah ada isinya) ATAU klik ikon keranjang di Navbar (bisa kapan
  // saja, termasuk pas keranjang masih kosong) — makanya statusnya
  // (isCartOpen) disimpan di store, bukan state lokal komponen ini.
  if (items.length === 0 && !isOpen) return null

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {isOpen && (
        <div className="bg-cream border-t border-ink/10 shadow-[0_-8px_30px_rgba(32,26,23,0.08)]">
          {items.length === 0 ? (
            <div className="max-w-3xl mx-auto px-4 py-10 text-center">
              <ShoppingBagIcon size={28} className="mx-auto text-char/40 mb-3" />
              <p className="font-display text-lg font-semibold">Keranjang masih kosong</p>
              <p className="text-char text-sm mt-1">
                Yuk pilih menu favoritmu dulu.
              </p>
              <button
                type="button"
                onClick={closeCart}
                className="mt-5 text-sm font-medium px-5 py-2 rounded-full bg-ink text-cream hover:bg-ink/90 transition"
              >
                Lihat menu
              </button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-4 max-h-[45vh] overflow-y-auto space-y-3">
              {items.map((item) => (
                <div key={item.productId} className="flex items-center gap-3">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-sm text-char">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center border border-ink/15 rounded-full overflow-hidden">
                    <button
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      className="px-2.5 py-1 hover:bg-ink/5"
                      aria-label="Kurangi"
                    >
                      −
                    </button>
                    <span className="px-3 select-none text-sm">{item.quantity}</span>
                    <button
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                      className="px-2.5 py-1 hover:bg-ink/5"
                      aria-label="Tambah"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-sambal text-sm ml-1 flex-shrink-0 hover:underline"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-ink text-cream">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <button
              onClick={toggleCart}
              className="flex items-center gap-2 text-left min-w-0"
            >
              <ShoppingBagIcon size={18} />
              <span className="min-w-0">
                <span className="font-medium">{totalItems} item</span>
                <ChevronDownIcon
                  size={14}
                  className={`inline-block ml-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </button>
            <div className="flex items-center gap-4 shrink-0">
              <span className="font-semibold">{formatPrice(totalPrice)}</span>
              <button
                onClick={() => navigate('/checkout')}
                className="bg-sambal text-cream rounded-full px-5 py-2 font-medium hover:bg-sambal/90 transition"
              >
                Bayar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
