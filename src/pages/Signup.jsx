import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Signup biasa (role default 'user', dibuat otomatis lewat trigger
// handle_new_user di 01_supabase_schema.sql). Halaman ini juga
// SENGAJA tidak ada di Navbar. Untuk jadi admin, role harus diubah
// manual lewat Supabase Table Editor:
//   update public.profiles set role = 'admin' where email = '...';
export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password minimal 6 karakter.')
      return
    }
    if (password !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.')
      return
    }

    setSubmitting(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Tanpa ini, link konfirmasi di email pakai "Site URL" default
        // project Supabase kamu (Authentication > URL Configuration) —
        // kalau itu masih http://localhost:3000 (bawaan Supabase),
        // link di email akan selalu ke localhost meskipun kamu buka
        // /signup dari domain Netlify. window.location.origin di sini
        // memastikan link-nya ikut domain yang sedang dipakai.
        //
        // CATATAN: domain yang dipakai TETAP harus didaftarkan di
        // Supabase Dashboard > Authentication > URL Configuration >
        // Redirect URLs, kalau tidak Supabase akan menolak/redirect
        // balik ke Site URL default walau emailRedirectTo diisi.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    setSubmitting(false)

    if (signUpError) {
      setError(
        signUpError.message === 'User already registered'
          ? 'Email ini sudah terdaftar. Coba login.'
          : signUpError.message
      )
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-2xl font-semibold text-ink mb-3">
            Pendaftaran berhasil
          </h1>
          <p className="text-sm text-char mb-1">
            Akun kamu sudah dibuat dengan role default{' '}
            <span className="font-medium text-ink">user</span>.
          </p>
          <p className="text-sm text-char mb-6">
            Kalau konfirmasi email aktif di project Supabase kamu, cek
            inbox dulu sebelum login. Supaya bisa masuk ke halaman admin,
            role akun ini harus diubah manual lewat Supabase Table
            Editor pada tabel{' '}
            <code className="text-xs bg-ink/5 px-1 py-0.5 rounded">
              profiles
            </code>
            .
          </p>
          <Link
            to="/login"
            className="inline-block rounded-full bg-ink text-cream font-medium px-6 py-2.5 hover:bg-ink/90 transition"
          >
            Ke halaman login
          </Link>
        </div>
      </div>
    )
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
          <p className="mt-2 text-sm text-char">Buat akun baru</p>
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
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
              placeholder="Minimal 6 karakter"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-char mb-1"
            >
              Konfirmasi Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-cream px-3 py-2 text-ink placeholder:text-char/40 focus:border-sambal focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-ink text-cream font-medium py-2.5 hover:bg-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Memproses...' : 'Daftar'}
          </button>
        </form>

        <p className="text-center text-sm text-char mt-6">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-sambal font-medium hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  )
}
