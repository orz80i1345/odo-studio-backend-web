import { Mail, Phone, Search, UserRound } from 'lucide-react'
import { customers, formatCurrency } from '../data/adminMock'

export function CustomerListPage() {
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
          {customers.map((customer) => (
            <article key={customer.email} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div className="flex gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand-subtle-ink">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <h2 className="font-medium text-ink">{customer.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
                    <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{customer.email}</span>
                    <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{customer.phone}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm lg:min-w-72">
                <Metric label="預約" value={`${customer.bookings} 次`} />
                <Metric label="消費" value={formatCurrency(customer.spent)} />
                <Metric label="最近" value={customer.lastVisit} />
              </div>
              <button className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                查看紀錄
              </button>
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
