import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { formatPrice } from '../lib/format'
import { ArrowRightIcon, LeafIcon, ShoppingBagIcon } from '../components/icons'

export default function Home() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const addItem = useCartStore((s) => s.addItem)
  const [justAdded, setJustAdded] = useState(null)

  useEffect(() => {
    let mounted = true
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!mounted) return
        if (!error) setProducts(data || [])
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  function handleQuickAdd(product) {
    addItem(product)
    setJustAdded(product.id)
    setTimeout(() => setJustAdded(null), 1200)
  }

  const featured = products[0]

  return (
    <div className="pb-28">
      {/* ---------------------------------------------------------- */}
      {/* HERO                                                       */}
      {/* ---------------------------------------------------------- */}
      <section className="bg-ink text-cream">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-turmeric bg-turmeric/10 px-3 py-1 rounded-full">
              <LeafIcon size={13} />
              Dimasak segar tiap hari
            </span>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-[1.1] mt-5">
              Rasa rumahan,
              <br />
              dipesan dalam hitungan menit.
            </h1>
            <p className="text-cream/70 mt-5 max-w-md leading-relaxed">
              Pilih menu, bayar online, lalu tinggal tunjukkan QR pesananmu
              saat mengambil. Gak perlu antre, gak perlu bingung.
            </p>
            <a
              href="#menu"
              className="inline-flex items-center gap-2 mt-8 bg-sambal text-cream font-medium px-6 py-3 rounded-full hover:bg-sambal/90 transition"
            >
              Lihat Menu
              <ArrowRightIcon size={16} />
            </a>
          </div>

          {featured && (
            <div className="relative">
              <div className="aspect-square rounded-3xl overflow-hidden bg-cream/5">
                {featured.image_url && (
                  <img
                    src={featured.image_url}
                    alt={featured.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 bg-cream text-ink rounded-2xl shadow-xl px-5 py-3.5 flex items-center gap-3 max-w-[calc(100%-2rem)]">
                <div className="min-w-0">
                  <p className="text-xs text-char">Menu favorit hari ini</p>
                  <p className="font-display font-semibold truncate">{featured.name}</p>
                </div>
                <span className="font-semibold text-sambal shrink-0">
                  {formatPrice(featured.price)}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* MENU                                                       */}
      {/* ---------------------------------------------------------- */}
      <section id="menu" className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="mb-10">
          <p className="text-sambal font-medium text-sm tracking-wide uppercase">
            Menu Kami
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-1">
            {loading ? 'Memuat menu...' : `${products.length} pilihan siap dipesan`}
          </h2>
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-ink/10">
                <div className="aspect-[4/3] bg-ink/5 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-2/3 bg-ink/10 rounded animate-pulse" />
                  <div className="h-3 w-full bg-ink/5 rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-ink/5 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-16 border border-dashed border-ink/15 rounded-2xl">
            <p className="text-char">Belum ada menu tersedia saat ini.</p>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <article
                key={p.id}
                className="group bg-white/60 border border-ink/10 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition duration-300"
              >
                <Link to={`/product/${p.id}`} className="block">
                  <div className="aspect-[4/3] overflow-hidden bg-ink/5">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    )}
                  </div>
                </Link>
                <div className="p-4 sm:p-5">
                  <Link to={`/product/${p.id}`}>
                    <h3 className="font-display text-lg font-semibold leading-snug">
                      {p.name}
                    </h3>
                  </Link>
                  <p className="text-char text-sm mt-1.5 line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="font-display font-semibold text-lg">
                      {formatPrice(p.price)}
                    </span>
                    <button
                      onClick={() => handleQuickAdd(p)}
                      className={`text-sm font-medium px-4 py-2 rounded-full transition flex items-center gap-1.5 ${
                        justAdded === p.id
                          ? 'bg-daun text-cream'
                          : 'bg-ink text-cream hover:bg-sambal'
                      }`}
                    >
                      {justAdded === p.id ? (
                        'Ditambahkan ✓'
                      ) : (
                        <>
                          <ShoppingBagIcon size={14} />
                          Tambah
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- */}
      {/* FOOTER                                                      */}
      {/* ---------------------------------------------------------- */}
      <footer className="border-t border-ink/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-char">
          <p>© {new Date().getFullYear()} Dapur Ibu. Semua resep dibuat dengan hati.</p>
          <p className="text-char/70">Pesan online, ambil dengan QR — cepat & praktis.</p>
        </div>
      </footer>
    </div>
  )
}
