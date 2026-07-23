import { AlertCircle, ArrowUpRight, CheckCircle2, KeyRound, MailWarning } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Spinner, type BookingPaymentStatus } from '@studio/shared'
import { formatCurrency } from '../data/adminMock'
import type { RawActivityLog } from '../activity'
import { useAdminBookings, useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

interface RawDoorLockCode {
  id: number
  booking_id: number
  send_status: string
}

interface RawEmailLog {
  id: number
  status: string
  to_email: string
  email_type: string
  last_error?: string | null
}

export function DashboardPage() {
  const { data: bookingPage, isLoading } = useAdminBookings()
  const { data: studioPage } = useAdminStudios()
  const activityQuery = useQuery({
    queryKey: ['admin', 'activity-logs'],
    queryFn: async () => {
      const res = await api.get<{ data: RawActivityLog[] }>('/public/admin_activity_logs', {
        pageSize: 8,
        sort: '-created_at',
      })
      return res.data
    },
  })
  const doorLockQuery = useQuery({
    queryKey: ['admin', 'door-lock-codes'],
    queryFn: async () => {
      const res = await api.get<{ data: RawDoorLockCode[] }>('/public/door_lock_codes', {
        pageSize: 200,
      })
      return res.data
    },
  })
  const failedEmailQuery = useQuery({
    queryKey: ['admin', 'failed-email-logs'],
    queryFn: async () => {
      const res = await api.get<{ data: RawEmailLog[] }>('/public/email_logs', {
        pageSize: 200,
        filter: 'status,in,failed,bounced,spam',
      })
      return res.data
    },
  })
  const bookings = bookingPage?.items ?? []
  const studioMap = new Map(studioPage?.items.map((studio) => [studio.id, studio.name]))
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled' && booking.status !== 'no_show')
  const pendingPayments = activeBookings.filter((booking) => booking.paymentStatus !== 'paid')
  const doorLocks = doorLockQuery.data ?? []
  const lockBookingIds = new Set(doorLocks.map((item) => item.booking_id))
  const pendingLockBookings = activeBookings.filter((booking) =>
    booking.status === 'confirmed' &&
    new Date(booking.startAt).getTime() >= Date.now() &&
    !lockBookingIds.has(Number(booking.id)),
  )
  const failedLockCodes = doorLocks.filter((item) => item.send_status === 'failed')
  const pendingLockCount = pendingLockBookings.length + failedLockCodes.length
  const failedEmailCount = failedEmailQuery.data?.length ?? 0
  const nextBookings = bookings
    .filter((booking) => booking.status !== 'cancelled')
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))
    .slice(0, 3)
  const today = new Date().toISOString().slice(0, 10)
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().slice(0, 10)
  const completedRevenue = bookings
    .filter((booking) => booking.paymentStatus === 'paid')
    .reduce((sum, booking) => sum + booking.totalPrice, 0)
  const dashboardStats = [
    { label: '今日預約', value: String(bookings.filter((b) => b.startAt.slice(0, 10) === today).length), hint: '依預約開始時間', tone: 'brand' },
    { label: '明日預約', value: String(bookings.filter((b) => b.startAt.slice(0, 10) === tomorrow).length), hint: '依預約開始時間', tone: 'info' },
    { label: '待付款', value: String(pendingPayments.length), hint: '非 paid 付款狀態', tone: 'warning' },
    { label: '已收金額', value: formatCurrency(completedRevenue), hint: '付款狀態 paid', tone: 'success' },
  ]

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
            <Link to="/bookings" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
              查看全部
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {nextBookings.map((booking) => (
              <div key={booking.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{booking.customerName}</span>
                    <StatusBadge label={booking.status === 'confirmed' ? '已確認' : '待處理'} tone={booking.status === 'confirmed' ? 'success' : 'warning'} />
                    <StatusBadge label={paymentLabels[booking.paymentStatus]} tone={paymentTone[booking.paymentStatus]} />
                  </div>
                  <p className="mt-1 text-sm text-ink-3">
                    {booking.bookingNumber} · {studioMap.get(booking.studioId) ?? `Studio #${booking.studioId}`} · {formatBookingDateTime(booking.startAt, booking.endAt)}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="font-medium text-ink">{formatCurrency(booking.totalPrice)}</div>
                  <div className="mt-1 text-sm text-ink-3">{booking.purpose ?? '未填用途'}</div>
                </div>
              </div>
            ))}
            {isLoading && <div className="px-5 py-10 text-center text-ink-3"><Spinner /></div>}
            {!isLoading && nextBookings.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-ink-3">目前沒有近期預約。</div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">需要處理</h2>
            <div className="mt-4 space-y-3">
              <Task icon={AlertCircle} title={`${pendingPayments.length} 筆付款待確認`} body="核對匯款帳號後五碼與入帳時間。" tone="warning" />
              <Task
                icon={KeyRound}
                title={`${pendingLockCount} 筆電子鎖待處理`}
                body={`${pendingLockBookings.length} 筆尚未建立密碼，${failedLockCodes.length} 筆寄送失敗。`}
                tone="info"
              />
              <Task
                icon={MailWarning}
                title={`${failedEmailCount} 封 Email 寄送失敗`}
                body="統計 status 為 failed、bounced、spam 的寄送紀錄。"
                tone="danger"
              />
              {(doorLockQuery.isLoading || failedEmailQuery.isLoading) && <div className="py-2 text-center text-ink-3"><Spinner /></div>}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">操作紀錄</h2>
            <div className="mt-4 space-y-4">
              {activityQuery.data?.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="mt-1 size-2 rounded-full bg-brand" />
                  <div>
                    <p className="text-sm text-ink">
                      <span className="font-medium">{activityActionLabel(item.action)}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {formatActivityTime(item.created_at)} · {item.entity_type ?? 'system'} {item.entity_id ? `#${item.entity_id}` : ''}
                    </p>
                  </div>
                </div>
              ))}
              {activityQuery.isLoading && <div className="py-4 text-center text-ink-3"><Spinner /></div>}
              {!activityQuery.isLoading && (activityQuery.data?.length ?? 0) === 0 && (
                <p className="text-sm text-ink-3">目前沒有操作紀錄。</p>
              )}
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
  deposit_paid: '訂金已付',
  paid: '已付款',
  refund_pending: '待退款',
  refunded: '已退款',
  failed: '付款失敗',
} satisfies Record<BookingPaymentStatus, string>

const paymentTone = {
  unpaid: 'neutral',
  deposit_paid: 'warning',
  paid: 'success',
  refund_pending: 'warning',
  refunded: 'info',
  failed: 'danger',
} satisfies Record<BookingPaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'>

function formatBookingDateTime(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const date = `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}`
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  return `${date} ${startTime}-${endTime}`
}

function formatActivityTime(value: string): string {
  const date = new Date(value)
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function activityActionLabel(action: string): string {
  const labels: Record<string, string> = {
    create_booking: '新增預約',
    update_booking: '更新預約',
    update_settings: '更新系統設定',
    update_business_hours: '更新營業時間',
    upsert_bank_account: '更新匯款帳號',
    update_notification_settings: '更新通知設定',
    set_24h_business_hours: '設定 24H 營業',
    create_time_slots: '產生預約時段',
    create_special_date: '新增特殊日期',
  }
  return labels[action] ?? action
}
