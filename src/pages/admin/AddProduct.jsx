import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Form tambah produk. Upload foto (kalau ada) ke Storage bucket
// "product-images" (dibuat di 01_supabase_schema.sql, public read,
// insert/update/delete cuma admin lewat RLS storage.objects) DULU,
// baru insert row ke tabel `products` pakai public URL hasil upload.
export default function AdminAddProduct() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function handleFileChange(e) {
    const selected = e.target.files?.[0]
    if (!selected) {
      setFile(null)
      setPreviewUrl('')
      return
    }

    if (!selected.type.startsWith('image/')) {
      setError('File harus berupa gambar.')
      return
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 5MB.')
      return
    }

    setError('')
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
  }

  function validate() {
    if (!name.trim()) return 'Nama produk wajib diisi.'
    const priceNum = Number(price)
    if (!price || Number.isNaN(priceNum) || priceNum < 0) {
      return 'Harga tidak valid.'
    }
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
      let imageUrl = null

      if (file) {
        const ext = file.name.split('.').pop()
        const path = `${crypto.randomUUID()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(path, file, { cacheControl: '3600', upsert: false })

        if (uploadError) {
          throw new Error(`Gagal upload gambar: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(path)

        imageUrl = publicUrlData.publicUrl
      }

      const { error: insertError } = await supabase.from('products').insert({
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        image_url: imageUrl,
        is_active: isActive,
      })

      if (insertError) {
        throw new Error(`Gagal menyimpan produk: ${insertError.message}`)
      }

      setSuccess(true)
      setTimeout(() => navigate('/admin'), 900)
    } catch (err) {
      setSubmitting(false)
      setError(err?.message || 'Terjadi kesalahan. Coba lagi.')
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-semibold mb-6">
        Tambah Produk
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="text-sm bg-sambal/15 text-sambal rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm bg-daun/15 text-daun rounded-lg px-3 py-2">
            Produk berhasil ditambahkan. Mengalihkan ke dashboard...
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Nama Produk
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-cream/20 bg-cream/5 px-3 py-2 text-cream placeholder:text-cream/30 focus:border-cream/50 focus:outline-none"
            placeholder="Nasi Goreng Spesial"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium mb-1"
          >
            Deskripsi
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-cream/20 bg-cream/5 px-3 py-2 text-cream placeholder:text-cream/30 focus:border-cream/50 focus:outline-none"
            placeholder="Deskripsi singkat menu ini..."
          />
        </div>

        <div>
          <label htmlFor="price" className="block text-sm font-medium mb-1">
            Harga (Rp)
          </label>
          <input
            id="price"
            type="number"
            min="0"
            step="500"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-lg border border-cream/20 bg-cream/5 px-3 py-2 text-cream placeholder:text-cream/30 focus:border-cream/50 focus:outline-none"
            placeholder="25000"
          />
        </div>

        <div>
          <label htmlFor="image" className="block text-sm font-medium mb-1">
            Foto Produk
          </label>
          <input
            id="image"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full text-sm text-cream/70 file:mr-3 file:rounded-full file:border-0 file:bg-cream file:text-ink file:px-4 file:py-2 file:text-sm file:font-medium"
          />
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              className="mt-3 w-32 h-32 object-cover rounded-xl border border-cream/10"
            />
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-cream/30"
          />
          Tampilkan di menu (aktif)
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-cream text-ink font-medium py-2.5 hover:bg-cream/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Menyimpan...' : 'Simpan Produk'}
        </button>
      </form>
    </div>
  )
}
