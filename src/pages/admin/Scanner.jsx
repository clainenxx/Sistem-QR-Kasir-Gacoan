import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { supabase } from '../../lib/supabase'

const SCANNER_ELEMENT_ID = 'qr-reader'

// Hasil RPC redeem_order_by_qr_token (dari 01_supabase_schema.sql):
//   'ok' | 'not_found' | 'not_paid' | 'expired' | 'already_redeemed'
const RESULT_MESSAGES = {
  ok: { label: 'Berhasil — pesanan diambil', className: 'bg-daun/15 text-daun' },
  not_found: {
    label: 'QR tidak ditemukan / tidak valid',
    className: 'bg-sambal/15 text-sambal',
  },
  not_paid: {
    label: 'Pesanan belum dibayar',
    className: 'bg-turmeric/20 text-turmeric',
  },
  expired: {
    label: 'QR sudah kedaluwarsa (lewat 24 jam)',
    className: 'bg-cream/15 text-cream/70',
  },
  already_redeemed: {
    label: 'QR ini sudah pernah discan sebelumnya',
    className: 'bg-turmeric/20 text-turmeric',
  },
}

// Isi QR yang di-scan adalah FULL URL (lihat OrderQR.jsx):
//   https://domain-kamu/order/<qr_token>
// Fungsi ini mengambil segmen terakhir sebagai token. Kalau yang
// ke-scan bukan URL (misal QR lain yang gak sengaja ke-scan), token
// hasil parsing kemungkinan gak match apa pun dan RPC akan balikin
// 'not_found' — aman, gak bakal salah redeem QR orang lain.
function extractTokenFromScannedText(text) {
  const trimmed = text.trim()
  const parts = trimmed.split('/').filter(Boolean)
  return parts[parts.length - 1] || trimmed
}

export default function AdminScanner() {
  const navigate = useNavigate()
  const scannerRef = useRef(null)
  const isProcessingRef = useRef(false)
  // true begitu kamera SUDAH dihentikan (manual, sebelum navigate ke
  // ScanResult). Dipakai supaya cleanup useEffect di bawah TIDAK
  // manggil stop()/clear() lagi ke instance yang sudah berhenti —
  // stop() kedua pada scanner yang statenya sudah NOT_STARTED bisa
  // throw error async yang gak selalu ketangkep rapi oleh html5-qrcode,
  // dan karena gak ada Error Boundary sebelumnya, itu bikin React
  // crash pas commit unmount -> layar blank putih sampai di-reload
  // manual. Lihat juga <ErrorBoundary> di main.jsx sebagai jaring
  // pengaman kalau ada crash serupa yang belum kepikiran.
  const stoppedRef = useRef(false)

  const [cameraError, setCameraError] = useState('')
  const [starting, setStarting] = useState(true)
  const [result, setResult] = useState(null) // { status, orderInfo? }
  const [checking, setChecking] = useState(false)

  // Hentikan kamera dengan aman — aman dipanggil berkali-kali (no-op
  // kalau sudah pernah berhasil berhenti sebelumnya).
  async function stopCameraSafely() {
    if (stoppedRef.current) return
    const instance = scannerRef.current
    if (!instance) return

    try {
      const state = instance.getState?.()
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        await instance.stop()
      }
      await instance.clear()
    } catch {
      // ignore — state kamera sudah gak konsisten, gak ada yang bisa
      // diperbaiki lagi di titik ini, yang penting gak throw ke atas.
    } finally {
      stoppedRef.current = true
    }
  }

  useEffect(() => {
    let cancelled = false
    const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = html5QrCode
    stoppedRef.current = false // reset tiap kali komponen ini mount lagi
    // (mis. admin klik "Scan Pesanan Berikutnya" balik ke /admin/scanner)

    async function start() {
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (cancelled) return
            handleScanSuccess(decodedText)
          },
          () => {
            // Callback error per-frame (gak ketemu QR di frame ini) —
            // ini NORMAL dan terjadi terus-menerus, sengaja diabaikan.
          }
        )
        if (!cancelled) setStarting(false)
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            'Gagal mengakses kamera. Pastikan browser diberi izin kamera dan halaman diakses lewat HTTPS.'
          )
          setStarting(false)
        }
      }
    }

    start()

    return () => {
      cancelled = true
      stopCameraSafely()
    }
  }, [])

  async function handleScanSuccess(decodedText) {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    setChecking(true)

    // Pause kamera sementara supaya QR yang sama gak ke-scan berkali2
    // dalam sepersekian detik sebelum request redeem selesai.
    try {
      await scannerRef.current?.pause(true)
    } catch {
      // ignore — kalau gagal pause, request redeem tetap jalan
    }

    const token = extractTokenFromScannedText(decodedText)

    const { data, error } = await supabase.rpc('redeem_order_by_qr_token', {
      p_token: token,
    })

    if (error) {
      setChecking(false)
      setResult({ status: 'not_found' })
      return
    }

    // Scan berhasil (baru discan ATAU sebelumnya sudah pernah) — ambil
    // detail order-nya (nama pemesan, item, total), matikan kamera, dan
    // pindah ke halaman hasil scan penuh (ScanResult.jsx) yang nampilin
    // ceklis + detail pesanan tanpa kamera di layar yang sama lagi.
    if (data === 'ok' || data === 'already_redeemed') {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.rpc('get_order_by_qr_token', { p_token: token }),
        supabase.rpc('get_order_items_by_qr_token', { p_token: token }),
      ])

      setChecking(false)

      const orderRow = orderRes.data?.[0]
      await stopCameraSafely()

      navigate(`/admin/scan-result/${token}`, {
        state: {
          status: data,
          order: orderRow || null,
          items: itemsRes.data || [],
        },
      })
      return
    }

    // Status gagal (not_found / not_paid / expired) — tetap di halaman
    // ini, tampilkan pesan, biar admin bisa langsung coba scan QR lain.
    setChecking(false)
    setResult({ status: data })
  }

  async function handleScanAgain() {
    setResult(null)
    isProcessingRef.current = false
    try {
      await scannerRef.current?.resume()
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl font-semibold mb-6">
        Scanner QR
      </h1>

      {cameraError ? (
        <div className="text-sm bg-sambal/15 text-sambal rounded-lg px-3 py-2">
          {cameraError}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-cream/10 bg-black">
          <div id={SCANNER_ELEMENT_ID} className="w-full" />
        </div>
      )}

      {starting && !cameraError && (
        <p className="mt-3 text-sm text-cream/60">Membuka kamera...</p>
      )}

      {checking && (
        <p className="mt-3 text-sm text-cream/60">Memeriksa QR...</p>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div
            className={`text-sm font-medium rounded-lg px-3 py-2.5 ${
              RESULT_MESSAGES[result.status]?.className ||
              'bg-cream/15 text-cream/70'
            }`}
          >
            {RESULT_MESSAGES[result.status]?.label || result.status}
          </div>

          <button
            type="button"
            onClick={handleScanAgain}
            className="w-full rounded-full bg-cream text-ink font-medium py-2.5 hover:bg-cream/90 transition"
          >
            Scan Lagi
          </button>
        </div>
      )}

      <p className="mt-4 text-xs text-cream/50">
        Arahkan kamera ke QR pesanan pelanggan. Setiap QR hanya bisa
        berhasil diambil satu kali.
      </p>
    </div>
  )
}
