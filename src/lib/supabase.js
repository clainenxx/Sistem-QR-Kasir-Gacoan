import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase env vars belum di-set. Cek file .env (lihat .env.example).'
  )
}

// PENTING: hanya pakai ANON key di frontend, JANGAN PERNAH taruh
// service_role key di sini / di kode React manapun. service_role
// hanya boleh dipakai di Supabase Edge Functions (server-side).
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
