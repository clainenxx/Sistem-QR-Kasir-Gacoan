// Helper format harga ke Rupiah, dipakai di Home, ProductDetail, popup
// keranjang, Checkout, dan halaman admin (Transaksi).
export function formatPrice(value) {
  const num = Number(value) || 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}
