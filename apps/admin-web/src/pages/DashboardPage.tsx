import { AlertCircle, ArrowUpRight, CheckCircle2, KeyRound, MailWarning } from 'lucide-react'
import { bookings, dashboardStats, formatCurrency, operations } from '../data/adminMock'

export function DashboardPage() {
  const pendingPayments = bookings.filter((booking) => booking.paymentStatus !== 'paid')
  const nextBookings = bookings.slice(0, 3)

  return (
    <section className="space-y-8">
      <PageIntro
        eyebrow="Dashboard"
        title="營運總覽"
        body="集中查看近期預約、付款確認、電子鎖寄送與 Email 異常。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <article key={stat.label} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-ink-3">{stat.label}</p>
              <span className={statToneClass[stat.tone]} />
            </div>
            <div className="mt-4 text-2xl font-semibold text-ink">{stat.value}</div>
            <p className="mt-1 text-sm text-ink-3">{stat.hint}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-lg border border-line bg-surface shadow-quiet">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-xl text-ink">近期預約</h2>
              <p className="mt-1 text-sm text-ink-3">依預約日期排序，優先處理付款與門鎖資訊。</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
              查看全部
              <ArrowUpRight className="size-4" />
            </button>
          </div>
          <div className="divide-y divide-line">
            {nextBookings.map((booking) => (
              <div key={booking.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{booking.customer}</span>
                    <StatusBadge label={booking.bookingStatus === 'confirmed' ? '已確認' : '待處理'} tone={booking.bookingStatus === 'confirmed' ? 'success' : 'warning'} />
                    <StatusBadge label={paymentLabels[booking.paymentStatus]} tone={paymentTone[booking.paymentStatus]} />
                  </div>
                  <p className="mt-1 text-sm text-ink-3">
                    {booking.number} · {booking.studio} · {booking.date} {booking.time}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="font-medium text-ink">{formatCurrency(booking.amount)}</div>
                  <div className="mt-1 text-sm text-ink-3">{booking.scene}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">需要處理</h2>
            <div className="mt-4 space-y-3">
              <Task icon={AlertCircle} title={`${pendingPayments.length} 筆付款待確認`} body="核對匯款帳號後五碼與入帳時間。" tone="warning" />
              <Task icon={KeyRound} title="2 筆電子鎖尚未填寫" body="預約日前一天 18:00 前需完成。" tone="info" />
              <Task icon={MailWarning} title="1 封 Email 寄送失敗" body="請檢查收件者信箱或手動重寄。" tone="danger" />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">操作紀錄</h2>
            <div className="mt-4 space-y-4">
              {operations.map((item) => (
                <div key={`${item.time}-${item.target}`} className="flex gap-3">
                  <div className="mt-1 size-2 rounded-full bg-brand" />
                  <div>
                    <p className="text-sm text-ink">
                      <span className="font-medium">{item.actor}</span> {item.action}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">{item.time} · {item.target}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-ink-3">{eyebrow}</p>
      <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-ink-2">{body}</p>
    </div>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeToneClass[tone]}`}>{label}</span>
}

function Task({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: typeof CheckCircle2
  title: string
  body: string
  tone: 'warning' | 'danger' | 'info'
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-sunken p-3">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${taskToneClass[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ink-3">{body}</p>
      </div>
    </div>
  )
}

const statToneClass: Record<string, string> = {
  brand: 'size-2.5 rounded-full bg-brand',
  info: 'size-2.5 rounded-full bg-info',
  warning: 'size-2.5 rounded-full bg-warning',
  success: 'size-2.5 rounded-full bg-success',
}

const badgeToneClass = {
  success: 'bg-success-subtle text-success-subtle-ink',
  warning: 'bg-warning-subtle text-warning-subtle-ink',
  danger: 'bg-danger-subtle text-danger-subtle-ink',
  info: 'bg-info-subtle text-info-subtle-ink',
  neutral: 'bg-neutral-subtle text-neutral-subtle-ink',
}

const taskToneClass = {
  warning: 'bg-warning-subtle text-warning-subtle-ink',
  danger: 'bg-danger-subtle text-danger-subtle-ink',
  info: 'bg-info-subtle text-info-subtle-ink',
}

const paymentLabels = {
  unpaid: '未付款',
  pending: '已付款待確認',
  paid: '已付款',
  refunded: '已退款',
}

const paymentTone = {
  unpaid: 'neutral',
  pending: 'warning',
  paid: 'success',
  refunded: 'info',
} as const
