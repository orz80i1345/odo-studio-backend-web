import { Calendar, Download, Filter, Plus, Search } from 'lucide-react'
import { bookings, formatCurrency, type AdminBookingStatus, type AdminPaymentStatus } from '../data/adminMock'

export function BookingListPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Bookings</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">預約管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">查看預約、付款狀態、來源與管理員備註，保留手動新增與匯出入口。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
            <Download className="size-4" />
            匯出
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
            <Plus className="size-4" />
            新增預約
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-line bg-surface shadow-quiet">
        <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[1fr_auto_auto_auto]">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-3">
            <Search className="size-4" />
            <input className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3" placeholder="搜尋姓名、電話、Email 或編號" />
          </label>
          <FilterButton icon={Calendar} label="07/01 - 07/31" />
          <FilterButton icon={Filter} label="預約狀態" />
          <FilterButton icon={Filter} label="付款狀態" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-line bg-sunken text-xs uppercase tracking-[0.12em] text-ink-3">
              <tr>
                <th className="px-4 py-3 font-medium">預約</th>
                <th className="px-4 py-3 font-medium">顧客</th>
                <th className="px-4 py-3 font-medium">日期時段</th>
                <th className="px-4 py-3 font-medium">金額</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium">備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((booking) => (
                <tr key={booking.id} className="align-top hover:bg-sunken/70">
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{booking.number}</div>
                    <div className="mt-1 text-xs text-ink-3">{sourceLabels[booking.source]}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{booking.customer}</div>
                    <div className="mt-1 text-xs text-ink-3">{booking.phone}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{booking.email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{booking.date} {booking.time}</div>
                    <div className="mt-1 text-xs text-ink-3">{booking.studio} · {booking.scene}</div>
                  </td>
                  <td className="px-4 py-4 font-medium text-ink">{formatCurrency(booking.amount)}</td>
                  <td className="px-4 py-4">
                    <StatusBadge label={bookingStatusLabels[booking.bookingStatus]} tone={bookingStatusTone[booking.bookingStatus]} />
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge label={paymentStatusLabels[booking.paymentStatus]} tone={paymentStatusTone[booking.paymentStatus]} />
                  </td>
                  <td className="max-w-[220px] px-4 py-4 text-xs leading-5 text-ink-3">{booking.note ?? '尚無備註'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function FilterButton({ icon: Icon, label }: { icon: typeof Filter; label: string }) {
  return (
    <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeToneClass[tone]}`}>{label}</span>
}

const sourceLabels = {
  web: '前台預約',
  admin: '後台建立',
  phone: '電話預約',
}

const bookingStatusLabels: Record<AdminBookingStatus, string> = {
  pending: '待處理',
  confirmed: '已確認',
  completed: '已完成',
  cancelled: '已取消',
}

const bookingStatusTone: Record<AdminBookingStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'danger',
}

const paymentStatusLabels: Record<AdminPaymentStatus, string> = {
  unpaid: '未付款',
  pending: '已付款待確認',
  paid: '已付款',
  refunded: '已退款',
}

const paymentStatusTone: Record<AdminPaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  unpaid: 'neutral',
  pending: 'warning',
  paid: 'success',
  refunded: 'info',
}

const badgeToneClass = {
  success: 'bg-success-subtle text-success-subtle-ink',
  warning: 'bg-warning-subtle text-warning-subtle-ink',
  danger: 'bg-danger-subtle text-danger-subtle-ink',
  info: 'bg-info-subtle text-info-subtle-ink',
  neutral: 'bg-neutral-subtle text-neutral-subtle-ink',
}
