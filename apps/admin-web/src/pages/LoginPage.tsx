import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError, authApi } from '@studio/shared'
import { api, TOKEN_KEY } from '../lib'

export function LoginPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)
      const session = await authApi.login(api, { email, password })
      localStorage.setItem(TOKEN_KEY, session.token)
      nav(next, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登入失敗，請稍後再試')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex min-h-[44vh] flex-col justify-between border-b border-line bg-sunken p-8 lg:border-b-0 lg:border-r lg:p-12">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-serif text-2xl text-ink">河日</span>
          <span className="text-xs uppercase tracking-[0.22em] text-ink-3">Ode Studio Admin</span>
        </Link>
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.25em] text-ink-3">Back office</p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-ink md:text-5xl">
            安靜地管理每一段光線與預約。
          </h1>
          <p className="mt-5 text-ink-2">
            管理預約、匯款確認、電子鎖密碼、場地資訊與通知紀錄。
          </p>
        </div>
        <p className="text-sm text-ink-3">© 2026 河日 Ode Studio</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-card">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-3">Admin Login</p>
            <h2 className="mt-2 font-serif text-3xl text-ink">後台登入</h2>
            <p className="mt-2 text-sm text-ink-3">請使用管理員 Email 與密碼登入。</p>
          </div>

          <div className="mt-8 space-y-4">
            <label>
              <span className="mb-2 block text-sm text-ink-2">Email</span>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-sunken px-3">
                <Mail className="size-4 text-ink-3" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
                  placeholder="owner@ode.studio"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </label>
            <label>
              <span className="mb-2 block text-sm text-ink-2">密碼</span>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-sunken px-3">
                <LockKeyhole className="size-4 text-ink-3" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60"
          >
            {isSubmitting ? '登入中...' : '登入後台'}
            <ArrowRight className="size-4" />
          </button>

          <p className="mt-4 text-center text-xs text-ink-3">
            使用 scaffold auth API，登入後會保存 JWT 供後台 API 使用。
          </p>
        </form>
      </section>
    </main>
  )
}
