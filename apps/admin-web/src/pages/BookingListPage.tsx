import { Calendar, ChevronLeft, ChevronRight, Download, Filter, Plus, Search } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { ApiError, Spinner, bookingsApi, queryKeys, type Booking, type BookingPaymentStatus, type BookingStatus } from '@studio/shared'
import { writeActivityLog } from '../activity'
import { formatCurrency } from '../data/adminMock'
import { useAdminBookings, useAdminScenes, useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

export function BookingListPage() {
  const qc = useQueryClient()
  const { data: bookingPage, isLoading } = useAdminBookings()
  const { data: studioPage } = useAdminStudios()
  const { data: scenePage } = useAdminScenes()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<BookingStatus | ''>('')
  const [paymentStatus, setPaymentStatus] = useState<BookingPaymentStatus | ''>('')
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()))
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingBookingId, setEditingBookingId] = useState<number | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const bookings = bookingPage?.items ?? []
  const defaultStudio = studioPage?.items[0]
  const studioMap = new Map(studioPage?.items.map((studio) => [studio.id, studio.name]))
  const sceneMap = new Map(scenePage?.items.map((scene) => [scene.id, scene.name]))
  const filteredBookings = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return bookings.filter((booking) => {
      const matchesMonth = monthKey(new Date(booking.startAt)) === selectedMonth
      const matchesSearch = !needle || [
        booking.bookingNumber,
        booking.customerName,
        booking.customerPhone,
        booking.customerEmail,
      ].some((value) => value.toLowerCase().includes(needle))
      return matchesMonth &&
        matchesSearch &&
        (!status || booking.status === status) &&
        (!paymentStatus || booking.paymentStatus === paymentStatus)
    })
  }, [bookings, paymentStatus, search, selectedMonth, status])
  const monthlyTotal = filteredBookings.reduce((sum, booking) => sum + booking.totalPrice, 0)

  const createBooking = useMutation({
    mutationFn: (input: Parameters<typeof bookingsApi.createAdminBooking>[1]) => bookingsApi.createAdminBooking(api, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all })
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots'] })
      setCreateError(null)
      setIsCreateOpen(false)
    },
  })
  const updateBooking = useMutation({
    mutationFn: ({ bookingId, input }: {
      bookingId: number
      input: Parameters<typeof bookingsApi.updateBooking>[2]
    }) => bookingsApi.updateBooking(api, bookingId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all })
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots'] })
      setEditError(null)
      setEditingBookingId(null)
    },
  })

  async function onCreateBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setCreateError(null)
      if (!defaultStudio) throw new Error('尚未建立攝影棚')
      const sceneIds = form.getAll('sceneIds').map(Number).filter(Number.isFinite)
      if (sceneIds.length === 0) throw new Error('請至少選擇一個佈景')
      const created = await createBooking.mutateAsync({
        studioId: Number(defaultStudio.id),
        startAt: new Date(String(form.get('startAt'))).toISOString(),
        endAt: new Date(String(form.get('endAt'))).toISOString(),
        customerName: String(form.get('customerName') ?? '').trim(),
        customerPhone: String(form.get('customerPhone') ?? '').trim(),
        customerEmail: String(form.get('customerEmail') ?? '').trim(),
        purpose: String(form.get('purpose') ?? '').trim() || undefined,
        customerNote: String(form.get('customerNote') ?? '').trim() || undefined,
        sceneIds,
        bookingMode: String(form.get('bookingMode') || (sceneIds.length >= 2 ? 'buyout' : 'scenes')) as Booking['bookingMode'],
        totalPrice: Number(form.get('totalPrice') ?? 0),
        status: String(form.get('status')) as BookingStatus,
        paymentStatus: String(form.get('paymentStatus')) as BookingPaymentStatus,
      })
      await writeActivityLog(api, {
        action: 'create_booking',
        entityType: 'booking',
        entityId: Number(created.id),
        changes: { bookingNumber: created.bookingNumber, status: created.status, paymentStatus: created.paymentStatus },
      })
      event.currentTarget.reset()
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '新增預約失敗')
    }
  }

  async function onUpdateBooking(event: FormEvent<HTMLFormElement>, booking: Booking) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setEditError(null)
      const updated = await updateBooking.mutateAsync({
        bookingId: Number(booking.id),
        input: {
          status: String(form.get('status')) as BookingStatus,
          paymentStatus: String(form.get('paymentStatus')) as BookingPaymentStatus,
          customerNote: String(form.get('customerNote') ?? '').trim() || undefined,
          cancellationReason: String(form.get('cancellationReason') ?? '').trim() || undefined,
        },
      })
      await writeActivityLog(api, {
        action: 'update_booking',
        entityType: 'booking',
        entityId: Number(updated.id),
        changes: { status: updated.status, paymentStatus: updated.paymentStatus, customerNote: updated.customerNote },
      })
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : '更新預約失敗')
    }
  }

  function exportCsv() {
    const header = ['booking_number', 'customer_name', 'customer_phone', 'customer_email', 'start_at', 'end_at', 'total_price', 'status', 'payment_status']
    const rows = filteredBookings.map((booking) => [
      booking.bookingNumber,
      booking.customerName,
      booking.customerPhone,
      booking.customerEmail,
      booking.startAt,
      booking.endAt,
      String(booking.totalPrice),
      booking.status,
      booking.paymentStatus,
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Bookings</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">預約管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">查看預約、付款狀態、來源與管理員備註，保留手動新增與匯出入口。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <Download className="size-4" />
            匯出
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover"
          >
            <Plus className="size-4" />
            新增預約
          </button>
        </div>
      </div>

      {isCreateOpen && (
        <form onSubmit={onCreateBooking} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-ink-2">
              <span className="block text-xs text-ink-3">攝影棚</span>
              <span className="mt-1 block text-ink">{defaultStudio?.name ?? '尚未建立攝影棚'}</span>
            </div>
            <Field name="customerName" label="顧客姓名" required />
            <Field name="customerPhone" label="電話" required />
            <Field name="customerEmail" label="Email" type="email" required />
            <Field name="startAt" label="開始時間" type="datetime-local" required />
            <Field name="endAt" label="結束時間" type="datetime-local" required />
            <Field name="totalPrice" label="總金額" type="number" min={0} defaultValue="0" required />
            <label>
              <span className="mb-2 block text-sm text-ink-2">預約方式</span>
              <select name="bookingMode" defaultValue="scenes" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                <option value="scenes">佈景</option>
                <option value="buyout">包場</option>
              </select>
            </label>
            <Field name="purpose" label="用途" />
            <label>
              <span className="mb-2 block text-sm text-ink-2">預約狀態</span>
              <select name="status" defaultValue="pending" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                {Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-sm text-ink-2">付款狀態</span>
              <select name="paymentStatus" defaultValue="unpaid" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                {Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-ink-2">備註</span>
              <input name="customerNote" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none" />
            </label>
            <fieldset className="md:col-span-2 xl:col-span-4">
              <legend className="mb-2 text-sm text-ink-2">佈景</legend>
              <div className="flex flex-wrap gap-2">
                {scenePage?.items.map((scene) => (
                  <label key={scene.id} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-2">
                    <input name="sceneIds" type="checkbox" value={scene.id} className="size-4 accent-brand" />
                    {scene.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {createError && <p className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{createError}</p>}
          <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
            <button type="submit" disabled={createBooking.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
              {createBooking.isPending ? '新增中...' : '建立預約'}
            </button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-line bg-surface shadow-quiet">
        <div className="grid gap-3 border-b border-line p-4 xl:grid-cols-[auto_1fr_auto_auto_auto]">
          <div className="flex h-10 items-center rounded-lg border border-line bg-surface">
            <button
              type="button"
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
              className="flex h-full w-10 items-center justify-center text-ink-2 hover:bg-sunken hover:text-ink"
              aria-label="上一月"
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-full border-x border-line bg-transparent px-3 text-sm text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
              className="flex h-full w-10 items-center justify-center text-ink-2 hover:bg-sunken hover:text-ink"
              aria-label="下一月"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-3">
            <Search className="size-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3" placeholder="搜尋姓名、電話、Email 或編號" />
          </label>
          <FilterButton icon={Calendar} label={`${filteredBookings.length} 筆 · ${formatCurrency(monthlyTotal)}`} onClick={() => setSearch('')} />
          <select value={status} onChange={(event) => setStatus(event.target.value as BookingStatus | '')} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2">
            <option value="">預約狀態</option>
            {Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as BookingPaymentStatus | '')} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2">
            <option value="">付款狀態</option>
            {Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
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
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-3"><Spinner /></td>
                </tr>
              )}
              {!isLoading && filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-3">目前沒有預約資料。</td>
                </tr>
              )}
              {filteredBookings.map((booking) => (
                <Fragment key={booking.id}>
                <tr className="align-top hover:bg-sunken/70">
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{booking.bookingNumber}</div>
                    <div className="mt-1 text-xs text-ink-3">{sourceLabels[booking.source]}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{booking.customerName}</div>
                    <div className="mt-1 text-xs text-ink-3">{booking.customerPhone}</div>
                    <div className="mt-0.5 text-xs text-ink-3">{booking.customerEmail}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{formatBookingDateTime(booking.startAt, booking.endAt)}</div>
                    <div className="mt-1 text-xs text-ink-3">
                      {studioMap.get(booking.studioId) ?? `Studio #${booking.studioId}`} · {sceneNames(booking.sceneIds, sceneMap)}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-medium text-ink">{formatCurrency(booking.totalPrice)}</td>
                  <td className="px-4 py-4">
                    <StatusBadge label={bookingStatusLabels[booking.status]} tone={bookingStatusTone[booking.status]} />
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge label={paymentStatusLabels[booking.paymentStatus]} tone={paymentStatusTone[booking.paymentStatus]} />
                  </td>
                  <td className="max-w-[220px] px-4 py-4 text-xs leading-5 text-ink-3">{booking.customerNote ?? '尚無備註'}</td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setEditingBookingId((value) => value === booking.id ? null : Number(booking.id))}
                      className="h-9 rounded-lg border border-line px-3 text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                    >
                      編輯
                    </button>
                  </td>
                </tr>
                {editingBookingId === booking.id && (
                  <tr key={`${booking.id}-edit`}>
                    <td colSpan={8} className="bg-sunken px-4 py-4">
                      <form onSubmit={(event) => onUpdateBooking(event, booking)} className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-2 xl:grid-cols-4">
                        <label>
                          <span className="mb-2 block text-sm text-ink-2">預約狀態</span>
                          <select name="status" defaultValue={booking.status} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                            {Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label>
                          <span className="mb-2 block text-sm text-ink-2">付款狀態</span>
                          <select name="paymentStatus" defaultValue={booking.paymentStatus} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                            {Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <Field name="cancellationReason" label="取消原因" defaultValue={booking.cancellationReason ?? ''} />
                        <Field name="customerNote" label="備註" defaultValue={booking.customerNote ?? ''} />
                        {editError && <p className="md:col-span-2 xl:col-span-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{editError}</p>}
                        <div className="flex justify-end gap-3 md:col-span-2 xl:col-span-4">
                          <button type="button" onClick={() => setEditingBookingId(null)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
                          <button type="submit" disabled={updateBooking.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
                            {updateBooking.isPending ? '儲存中...' : '儲存'}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function FilterButton({ icon: Icon, label, onClick }: { icon: typeof Filter; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
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
  walk_in: '現場預約',
}

const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: '待處理',
  confirmed: '已確認',
  checked_in: '已入場',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到',
}

const bookingStatusTone: Record<BookingStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'success',
  checked_in: 'info',
  completed: 'info',
  cancelled: 'danger',
  no_show: 'danger',
}

const paymentStatusLabels: Record<BookingPaymentStatus, string> = {
  unpaid: '未付款',
  deposit_paid: '訂金已付',
  paid: '已付款',
  refund_pending: '待退款',
  refunded: '已退款',
  failed: '付款失敗',
}

const paymentStatusTone: Record<BookingPaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  unpaid: 'neutral',
  deposit_paid: 'warning',
  paid: 'success',
  refund_pending: 'warning',
  refunded: 'info',
  failed: 'danger',
}

const badgeToneClass = {
  success: 'bg-success-subtle text-success-subtle-ink',
  warning: 'bg-warning-subtle text-warning-subtle-ink',
  danger: 'bg-danger-subtle text-danger-subtle-ink',
  info: 'bg-info-subtle text-info-subtle-ink',
  neutral: 'bg-neutral-subtle text-neutral-subtle-ink',
}

function formatBookingDateTime(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const date = `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}`
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  return `${date} ${startTime}-${endTime}`
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(value: string, offset: number): string {
  const [year, month] = value.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1 + offset, 1)
  return monthKey(date)
}

function sceneNames(sceneIds: number[], sceneMap: Map<number, string>): string {
  const names = sceneIds.map((id) => sceneMap.get(id)).filter(Boolean)
  return names.length > 0 ? names.join('、') : '未指定佈景'
}

function Field({
  name,
  label,
  type = 'text',
  required,
  min,
  defaultValue,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  min?: number
  defaultValue?: string
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand"
      />
    </label>
  )
}
