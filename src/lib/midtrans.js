// Loader kecil buat script Snap.js Midtrans. Di-cache di module-level
// (`loadPromise`) supaya script cuma pernah di-inject sekali walau
// dipanggil berkali-kali (misal preload di useEffect + submit form).
//
// SANDBOX: pakai app.sandbox.midtrans.com sesuai permintaan (Midtrans
// SB). Kalau nanti mau ke production, ganti jadi https://app.midtrans.com/snap/snap.js
// dan pastikan VITE_MIDTRANS_CLIENT_KEY juga diganti ke client key
// production (bukan yang diawali "SB-Mid-client-" / sandbox key).
const SNAP_SRC_SANDBOX = 'https://app.sandbox.midtrans.com/snap/snap.js'

let loadPromise = null

export function loadMidtransSnap() {
  if (typeof window !== 'undefined' && window.snap) {
    return Promise.resolve(window.snap)
  }
  if (loadPromise) return loadPromise

  const clientKey = import.meta.env.VITE_MIDTRANS_CLIENT_KEY

  loadPromise = new Promise((resolve, reject) => {
    if (!clientKey) {
      loadPromise = null
      reject(new Error('VITE_MIDTRANS_CLIENT_KEY belum di-set di .env'))
      return
    }

    const script = document.createElement('script')
    script.src = SNAP_SRC_SANDBOX
    script.setAttribute('data-client-key', clientKey)
    script.async = true

    script.onload = () => {
      if (window.snap) {
        resolve(window.snap)
      } else {
        loadPromise = null
        reject(new Error('Snap.js dimuat tapi window.snap tidak tersedia.'))
      }
    }

    script.onerror = () => {
      loadPromise = null
      reject(new Error('Gagal memuat script Midtrans Snap.'))
    }

    document.head.appendChild(script)
  })

  return loadPromise
}
