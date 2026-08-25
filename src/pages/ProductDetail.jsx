import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../store/cartStore'
import { formatPrice } from '../lib/format'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addItem = useCartStore((s) => s.addItem)

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setNotFound(false)
    setAdded(false)
    setQuantity(1)

    async function loadProduct() {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, price, image_url')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle()

      if (!mounted) return
      if (error || !data) {
        setNotFound(true)
      } else {
        setProduct(data)
      }
      setLoading(false)
    }

    loadProduct()
    return () => {
      mounted = false
    }
  }, [id])

  function handleAddToCart() {
    if (!product) return
    for (let i = 0; i < quantity; i += 1) {
      addItem(product)
    }
    setAdded(true)
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-char">
        Memuat...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-char px-4">
        <p>Menu tidak ditemukan atau sudah tidak tersedia.</p>
        <Link to="/" className="text-sambal font-medium hover:underline">
          Kembali ke menu
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 pb-28">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-sm text-char hover:text-ink mb-6"
      >
        ← Kembali
      </button>

      <div className="grid sm:grid-cols-2 gap-8">
        <div className="aspect-square bg-ink/5 rounded-2xl overflow-hidden">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-char/40 text-sm">
              Tanpa foto
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <h1 className="font-display text-2xl font-semibold text-ink">
            {product.name}
          </h1>
          <p className="mt-3 text-char whitespace-pre-line">
            {product.description}
          </p>
          <p className="mt-4 text-xl font-semibold text-sambal">
            {formatPrice(product.price)}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <span className="text-sm text-char">Jumlah</span>
            <div className="flex items-center border border-ink/15 rounded-full overflow-hidden">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-1.5 text-ink hover:bg-ink/5"
                aria-label="Kurangi jumlah"
              >
                −
              </button>
              <span className="px-3 min-w-[2rem] text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="px-3 py-1.5 text-ink hover:bg-ink/5"
                aria-label="Tambah jumlah"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className="mt-6 w-full sm:w-auto rounded-full bg-ink text-cream font-medium px-6 py-2.5 hover:bg-ink/90 transition"
          >
            {added ? 'Ditambahkan ✓' : 'Masukkan ke Keranjang'}
          </button>

          {added && (
            <p className="mt-2 text-sm text-daun">
              {quantity} {product.name} ditambahkan ke keranjang.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
