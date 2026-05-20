'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, AlertCircle, LogIn, UserPlus } from 'lucide-react'
import { getSupabaseBrowser, hasSupabaseConfig } from '@/lib/supabase/client'

type Mode = 'login' | 'signup'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') || '/dashboard'

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const configured = hasSupabaseConfig()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!configured) {
      setError(
        'Supabase no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY a .env.local y reiniciá el dev server.'
      )
      return
    }

    setLoading(true)
    setError(null)
    setInfo(null)

    try {
      const supabase = getSupabaseBrowser()

      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || undefined,
            },
          },
        })

        if (signUpError) throw signUpError

        setInfo(
          'Cuenta creada. Revisá tu mail para confirmar si Email Confirmation está activado en Supabase.'
        )
        setMode('login')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        router.push(next)
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center gap-3 justify-center mb-8">
          <Image src="/logo.png" alt="Overseer" width={44} height={44} className="rounded-xl" priority />
          <h1 className="text-2xl font-bold text-white tracking-wider uppercase">
            Overseer
          </h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => {
                setMode('login')
                setError(null)
                setInfo(null)
              }}
              type="button"
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                mode === 'login'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 inline mr-1.5" /> Ingresar
            </button>

            <button
              onClick={() => {
                setMode('signup')
                setError(null)
                setInfo(null)
              }}
              type="button"
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${
                mode === 'signup'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 inline mr-1.5" /> Crear cuenta
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Nombre opcional
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {info && (
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !configured}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>

          {!configured && (
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Supabase no está configurado todavía. Pegá tu{' '}
              <code className="text-indigo-400">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{' '}
              y{' '}
              <code className="text-indigo-400">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{' '}
              en <code>.env.local</code> y reiniciá el dev server.
            </p>
          )}
        </div>

        <p className="text-[10px] text-zinc-600 text-center mt-4">
          Sistema personal de gestión — Overseer Life OS
        </p>
      </motion.div>
    </div>
  )
}