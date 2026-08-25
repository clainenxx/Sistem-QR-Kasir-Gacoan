import { Component } from 'react'

// React Error Boundary HARUS class component (belum ada hook
// setara resmi). Menangkap error yang terjadi selagi render/commit
// di bawah pohon komponen ini, dan menampilkan fallback UI alih-alih
// membiarkan seluruh app crash jadi layar blank putih.
//
// Ini jaring pengaman terakhir, BUKAN pengganti fix akar masalah —
// contoh kasus nyata yang sudah diperbaiki di kode: Scanner.jsx
// (html5-qrcode) sempat manggil stop()/clear() dua kali (sekali
// manual sebelum navigate, sekali lagi otomatis pas komponen
// unmount), yang kadang throw error async saat React lagi commit
// unmount. Boundary ini memastikan kalau ada error serupa yang lolos
// di kemudian hari, user tetap lihat pesan + tombol reload — bukan
// blank putih tanpa penjelasan.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error ditangkap ErrorBoundary:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center bg-cream text-ink">
          <p className="font-display text-xl font-semibold">
            Terjadi kesalahan tak terduga
          </p>
          <p className="text-char text-sm max-w-sm">
            Halaman ini gagal ditampilkan. Coba muat ulang — kalau
            masih terjadi, kembali ke halaman utama.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-full bg-ink text-cream px-5 py-2.5 font-medium hover:bg-ink/90 transition"
            >
              Muat Ulang
            </button>
            <a
              href="/"
              className="rounded-full border border-ink/20 px-5 py-2.5 font-medium hover:bg-ink/5 transition"
            >
              Ke Halaman Utama
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
