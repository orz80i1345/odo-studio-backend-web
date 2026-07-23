import { Mail, Phone, Search, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Spinner } from '@studio/shared'
import { formatCurrency } from '../data/adminMock'
import { useAdminBookings, useAdminCustomers } from '../hooks/useAdminData'

export function CustomerListPage() {
  const { data: customerPage, isLoading: isLoadingCustomers } = useAdminCustomers()
  const { data: bookingPage } = useAdminBookings()
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null)
  const bookingStats = buildBookingStats(bookingPage?.items ?? [])
  const customers = customerPage?.items ?? []

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Customers</p>
        <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">顧客列表</h1>
        <p className="mt-3 max-w-2xl text-ink-2">彙整預約中的姓名、聯絡方式、預約次數與累積消費，方便客服與回訪。</p>
      </div>

      <section className="rounded-lg border border-line bg-surface shadow-quiet">
        <div className="border-b border-line p-4">
          <label className="flex h-10 max-w-xl items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-3">
            <Search className="size-4" />
            <input className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3" placeholder="搜尋姓名、電話或 Email" />
          </label>
        </div>
        <div className="grid divide-y divide-line">
          {isLoadingCustomers && <div className="p-10 text-center text-ink-3"><Spinner /></div>}
          {!isLoadingCustomers && customers.length === 0 && (
            <div className="p-10 text-center text-sm text-ink-3">目前沒有顧客帳號資料。</div>
          )}
          {customers.map((customer) => (
            <article key={customer.email} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand-subtle-ink">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <h2 className="font-medium text-ink">{customer.displayName ?? customer.email}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
                    <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{customer.email}</span>
                    <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{customer.phone ?? '未填電話'}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-72">
                <Metric label="預約" value={`${bookingStats.get(customer.email)?.count ?? 0} 次`} />
                <Metric label="消費" value={formatCurrency(bookingStats.get(customer.email)?.spent ?? 0)} />
                <Metric label="最近" value={bookingStats.get(customer.email)?.lastVisit ?? '-'} />
              </div>
              <button
                type="button"
                onClick={() => setExpandedEmail((email) => email === customer.email ? null : customer.email)}
                className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
              >
                {expandedEmail === customer.email ? '收合紀錄' : '查看紀錄'}
              </button>
              {expandedEmail === customer.email && (
                <div className="lg:col-span-3 rounded-lg border border-line bg-sunken p-4">
                  <h3 className="text-sm font-medium text-ink">預約紀錄</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    {(bookingPage?.items ?? []).filter((booking) => booking.customerEmail === customer.email).map((booking) => (
                      <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface px-3 py-2">
                        <span className="text-ink">{booking.bookingNumber}</span>
                        <span className="text-ink-3">{formatDate(booking.startAt)}</span>
                        <span className="font-medium text-ink">{formatCurrency(booking.totalPrice)}</span>
                      </div>
                    ))}
                    {!(bookingPage?.items ?? []).some((booking) => booking.customerEmail === customer.email) && (
                      <p className="text-ink-3">尚無預約紀錄。</p>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sunken p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-medium text-ink">{value}</div>
    </div>
  )
}

function buildBookingStats(bookings: Array<{ customerEmail: string; totalPrice: number; startAt: string }>) {
  const stats = new Map<string, { count: number; spent: number; lastVisit: string; lastAt: string }>()
  for (const booking of bookings) {
    const previous = stats.get(booking.customerEmail)
    const isLatest = !previous || booking.startAt > previous.lastAt
    stats.set(booking.customerEmail, {
      count: (previous?.count ?? 0) + 1,
      spent: (previous?.spent ?? 0) + booking.totalPrice,
      lastVisit: isLatest ? formatDate(booking.startAt) : previous.lastVisit,
      lastAt: isLatest ? booking.startAt : previous.lastAt,
    })
  }
  return stats
}

function formatDate(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}
