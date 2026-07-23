import { useQueryClient } from '@tanstack/react-query'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Warehouse,
} from 'lucide-react'
import { cn } from '@studio/shared'
import { useAdminMe } from '../hooks/useAdminData'
import { TOKEN_KEY } from '../lib'

const navItems = [
  { to: '/', label: '儀表板', icon: LayoutDashboard, end: true },
  { to: '/bookings', label: '預約管理', icon: ClipboardList },
  { to: '/schedule', label: '檔期日曆', icon: CalendarDays },
  { to: '/studios', label: '攝影棚管理', icon: Warehouse },
  { to: '/customers', label: '顧客', icon: Users },
  { to: '/settings', label: '設定', icon: Settings },
]

export function AdminLayout() {
  const qc = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const token = localStorage.getItem(TOKEN_KEY)
  const { data: me } = useAdminMe()

  if (!token) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return (
    <div className="min-h-dvh bg-sunken text-ink lg:flex">
      <aside className="border-b border-line bg-surface/95 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="font-serif text-xl text-ink">河日</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink-3">Admin</span>
          </NavLink>
          <span className="rounded-full bg-brand-subtle px-2 py-1 text-[11px] font-medium text-brand-subtle-ink">
            {me?.role ?? 'admin'}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-max items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-subtle font-medium text-brand-subtle-ink'
                    : 'text-ink-2 hover:bg-sunken hover:text-ink',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line p-4 lg:block">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-3">Ode Studio</p>
          <p className="mt-2 text-sm text-ink-2">24H 預約、匯款確認與電子鎖通知管理。</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-5 md:px-8">
            <label className="hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-3 md:flex">
              <Search className="size-4" />
              <input
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                placeholder="搜尋預約編號、姓名、電話或 Email"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(TOKEN_KEY)
                qc.clear()
                navigate('/login', { replace: true })
              }}
              title="Sign out"
              className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left hover:bg-sunken"
            >
              <div className="size-7 rounded-full bg-brand-subtle" />
              <div className="hidden text-sm sm:block">
                <div className="font-medium text-ink">{me?.email ?? '已登入'}</div>
                <div className="text-xs text-ink-3">Sign out</div>
              </div>
            </button>
          </div>
        </header>
        <main className="px-5 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
