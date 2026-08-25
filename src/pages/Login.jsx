import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Halaman ini SENGAJA tidak ada di Navbar — hanya bisa diakses lewat
// mengetik /login langsung di browser. Ini login untuk admin (akun
// biasa didaftarkan lewat /signup lalu role-nya di-upgrade manual di
// Supabase Table Editor, lihat catatan di 01_supabase_schema.sql).
export default function Login() {
  const navigate = useNavigate()
  const { session, isAdmin, loading: authLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Kalau sudah login (session ada), langsung redirect —
  // admin ke /admin, user biasa balik ke home.
  useEffect(() => {
    if (!authLoading && session) {
      navigate(isAdmin ? '/admin' : '/', { replace: true })
    }
  }, [authLoading, session, isAdmin, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setSubmitting(false)

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Email atau password salah.'
          : signInError.message
      )
      return
    }

    // Tidak perlu navigate manual di sini — AuthContext dengar
    // onAuthStateChange, session ke-update, lalu useEffect di atas
    // yang urus redirect-nya.
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link
            to="/"
            className="font-display text-2xl font-semibold tracking-tight text-ink"
          >
            Dapur Ibu
          </Link>
          <p className="mt-2 text-sm text-char">Masuk ke akun admin</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/60 border border-ink/10 rounded-2xl p-6 space-y-4 shadow-sm"
          noValidate
        >
          {error && (
            <div
              role="alert"
              className="text-sm text-sambal bg-sambal/10 border border-sambal/20 rounded-lg px-3 py-2"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-char mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
              placeholder="kamu@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-char mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-ink text-cream font-medium py-2.5 hover:bg-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-sm text-char mt-6">
          Belum punya akun?{' '}
          <Link to="/signup" className="text-sambal font-medium hover:underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  )
}
