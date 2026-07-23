import { ChevronLeft, ChevronRight, Clock, Lock, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { writeActivityLog } from '../activity'
import { useAdminBookings, useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

interface RawTimeSlot {
  id: number
  slot_date: string
  start_minute: number
  end_minute: number
  status?: string
  booking_id?: number | null
  hourly_price?: number
}

interface RawBusinessHour {
  id: number
  studio_id: number
  weekday: number
}

export function SchedulePage() {
  const qc = useQueryClient()
  const { data: bookingPage } = useAdminBookings()
  const { data: studioPage } = useAdminStudios()
  const [weekOffset, setWeekOffset] = useState(0)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedStudioId, setSelectedStudioId] = useState<number | ''>('')
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()))
  const [message, setMessage] = useState<string | null>(null)
  const studios = studioPage?.items ?? []
  const activeStudioId = selectedStudioId || studios[0]?.id
  const activeStudio = studios.find((studio) => studio.id === activeStudioId)
  const weekLabel = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + weekOffset * 7)
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
  }, [weekOffset])
  const weekDays = useMemo(() => buildWeekDays(weekOffset), [weekOffset])
  const daySlots = useQuery({
    queryKey: ['admin', 'time-slots', activeStudioId, selectedDate],
    enabled: !!activeStudioId && !!selectedDate,
    queryFn: async () => {
      const range = dayRange(selectedDate)
      const res = await api.get<{ data: RawTimeSlot[] }>('/public/time_slots', {
        pageSize: 200,
        filter: [
          `studio_id,eq,${activeStudioId}`,
          `slot_date,gte,${range.start}`,
          `slot_date,lt,${range.end}`,
        ],
        sort: 'start_minute',
      })
      return res.data
    },
  })
  const createSpecialDate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/public/special_dates', body),
    onSuccess: () => {
      setMessage('特殊日期已新增')
      writeActivityLog(api, {
        action: 'create_special_date',
        entityType: 'special_date',
      })
      setIsCreateOpen(false)
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '特殊日期新增失敗'),
  })
  const setBusinessHours24h = useMutation({
    mutationFn: async (studioId: number) => {
      const existing = await api.get<{ data: RawBusinessHour[] }>('/public/business_hours', {
        pageSize: 100,
        filter: `studio_id,eq,${studioId}`,
      })
      for (let weekday = 0; weekday < 7; weekday++) {
        const current = existing.data.find((item) => item.weekday === weekday)
        const payload = {
          studio_id: studioId,
          weekday,
          start_minute: 0,
          end_minute: 1440,
          is_closed: false,
          note: '24H',
          metadata: '{}',
        }
        if (current) await api.patch(`/public/business_hours/${current.id}`, payload)
        else await api.post('/public/business_hours', payload)
      }
    },
    onSuccess: () => {
      setMessage('已設定為 24H 營業')
      writeActivityLog(api, {
        action: 'set_24h_business_hours',
        entityType: 'business_hours',
        entityId: Number(activeStudioId),
      })
      qc.invalidateQueries({ queryKey: ['admin', 'business-hours'] })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '設定 24H 失敗'),
  })
  const createTimeSlots = useMutation({
    mutationFn: async (input: {
      studioId: number
      date: string
      startMinute: number
      endMinute: number
      intervalMinutes: number
      hourlyPrice?: number
    }) => {
      const existingStarts = new Set((daySlots.data ?? []).map((slot) => slot.start_minute))
      let created = 0
      for (let minute = input.startMinute; minute < input.endMinute; minute += input.intervalMinutes) {
        const endMinute = Math.min(minute + input.intervalMinutes, input.endMinute)
        if (existingStarts.has(minute) || endMinute <= minute) continue
        await api.post('/public/time_slots', {
          studio_id: input.studioId,
          slot_date: toApiDateTime(input.date),
          start_minute: minute,
          end_minute: endMinute,
          status: 'available',
          hourly_price: input.hourlyPrice,
          metadata: '{}',
        })
        created += 1
      }
      return created
    },
    onSuccess: (created) => {
      setMessage(created > 0 ? `已產生 ${created} 個預約時段` : '此日期已有相同開始時間的時段')
      writeActivityLog(api, {
        action: 'create_time_slots',
        entityType: 'time_slots',
        entityId: Number(activeStudioId),
        changes: { date: selectedDate, created },
      })
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots', activeStudioId, selectedDate] })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '產生預約時段失敗'),
  })
  const applyDefaultPriceToFutureSlots = useMutation({
    mutationFn: async (input: { studioId: number; hourlyPrice: number }) => {
      const today = formatLocalDate(new Date())
      const res = await api.get<{ data: RawTimeSlot[] }>('/public/time_slots', {
        pageSize: 1000,
        filter: [
          `studio_id,eq,${input.studioId}`,
          `slot_date,gte,${toApiDateTime(today)}`,
          'status,eq,available',
        ],
      })
      await Promise.all(res.data.map((slot) => api.patch(`/public/time_slots/${slot.id}`, {
        hourly_price: input.hourlyPrice,
        metadata: '{}',
      })))
      await writeActivityLog(api, {
        action: 'apply_default_hourly_price',
        entityType: 'time_slots',
        entityId: input.studioId,
        changes: { hourlyPrice: input.hourlyPrice, updated: res.data.length },
      })
      return res.data.length
    },
    onSuccess: (updated) => {
      setMessage(`已套用基本時租到 ${updated} 個未來未預約時段`)
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots'] })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '套用基本時租失敗'),
  })
  const resetTimeSlots = useMutation({
    mutationFn: async () => {
      const slots = daySlots.data ?? []
      for (const slot of slots) {
        await api.delete(`/public/time_slots/${slot.id}`)
      }
      await writeActivityLog(api, {
        action: 'reset_time_slots',
        entityType: 'time_slots',
        entityId: Number(activeStudioId),
        changes: { date: selectedDate, deleted: slots.length },
      })
      return slots.length
    },
    onSuccess: (deleted) => {
      setMessage(`已清除 ${deleted} 個預約時段`)
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots', activeStudioId, selectedDate] })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '重設時段失敗'),
  })
  const confirmedBookings = (bookingPage?.items ?? [])
    .filter((booking) => booking.status === 'confirmed')
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))
    .slice(0, 5)
  const selectedDateBookings = (bookingPage?.items ?? []).filter((booking) =>
    booking.studioId === activeStudioId &&
    booking.startAt.slice(0, 10) === selectedDate &&
    isActiveBooking(booking.status),
  )

  function onCreateSpecialDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const isAllDay = form.get('allDay') === 'on'
    const startMinute = isAllDay ? 0 : timeToMinute(String(form.get('startTime') || '00:00'))
    const endMinute = isAllDay ? 1440 : timeToMinute(String(form.get('endTime') || '00:00'))
    if (endMinute <= startMinute) {
      setMessage('結束時間必須晚於開始時間')
      return
    }
    createSpecialDate.mutate({
      studio_id: form.get('studioId') ? Number(form.get('studioId')) : undefined,
      special_date: toApiDateTime(String(form.get('specialDate'))),
      date_type: String(form.get('dateType')),
      name: String(form.get('name') ?? '').trim() || undefined,
      description: String(form.get('description') ?? '').trim() || undefined,
      start_minute: startMinute,
      end_minute: endMinute,
      price_multiplier: Number(form.get('priceMultiplier') || 1),
      is_recurring: false,
      metadata: {},
    })
  }

  function onCreateTimeSlots(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeStudioId) return
    const form = new FormData(event.currentTarget)
    const isAllDay = form.get('allDay') === 'on'
    const startMinute = isAllDay ? 0 : timeToMinute(String(form.get('startTime') || '00:00'))
    const endMinute = isAllDay ? 1440 : timeToMinute(String(form.get('endTime') || '00:00'))
    if (endMinute <= startMinute) {
      setMessage('結束時間必須晚於開始時間')
      return
    }
    createTimeSlots.mutate({
      studioId: Number(activeStudioId),
      date: selectedDate,
      startMinute,
      endMinute,
      intervalMinutes: Number(form.get('intervalMinutes') || 60),
      hourlyPrice: form.get('hourlyPrice') ? Number(form.get('hourlyPrice')) : undefined,
    })
  }

  function onResetTimeSlots() {
    const count = daySlots.data?.length ?? 0
    if (count === 0) {
      setMessage('此日沒有可清除的預約時段')
      return
    }
    if (!window.confirm(`確定清除 ${selectedDate} 的 ${count} 個預約時段？`)) return
    resetTimeSlots.mutate()
  }

  function onApplyDefaultPriceToFutureSlots() {
    if (!activeStudio || !activeStudioId) return
    if (!window.confirm(`確定將「${activeStudio.name}」的基本時租 NT$ ${activeStudio.defaultHourlyPrice.toLocaleString()} 套用到今天以後所有未預約時段？`)) return
    applyDefaultPriceToFutureSlots.mutate({
      studioId: Number(activeStudioId),
      hourlyPrice: activeStudio.defaultHourlyPrice,
    })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Schedule</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">日曆與時段管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">以分鐘數管理營業時間、可預約時段、公休日、維護與包場日。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover"
        >
          <Plus className="size-4" />
          新增特殊日期
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4 shadow-quiet">
        <label className="min-w-56">
          <span className="mb-2 block text-sm text-ink-2">目前攝影棚</span>
          <select
            value={activeStudioId ?? ''}
            onChange={(event) => setSelectedStudioId(Number(event.target.value))}
            className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none"
          >
            {studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!activeStudioId || setBusinessHours24h.isPending}
          onClick={() => activeStudioId && setBusinessHours24h.mutate(Number(activeStudioId))}
          className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-50"
        >
          {setBusinessHours24h.isPending ? '設定中...' : '設為 24H 營業'}
        </button>
        <button
          type="button"
          disabled={!activeStudioId || !activeStudio || applyDefaultPriceToFutureSlots.isPending}
          onClick={onApplyDefaultPriceToFutureSlots}
          className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-50"
        >
          {applyDefaultPriceToFutureSlots.isPending ? '套用中...' : '套用基本時租到未來時段'}
        </button>
        <span className="text-xs text-ink-3">會寫入週日到週六 00:00-24:00。</span>
      </div>

      {isCreateOpen && (
        <form onSubmit={onCreateSpecialDate} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="mb-2 block text-sm text-ink-2">攝影棚</span>
              <select name="studioId" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                <option value="">全部攝影棚</option>
                {studioPage?.items.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
              </select>
            </label>
            <Field name="specialDate" label="日期" type="date" required />
            <label>
              <span className="mb-2 block text-sm text-ink-2">類型</span>
              <select name="dateType" defaultValue="closed" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                <option value="closed">公休</option>
                <option value="maintenance">維護</option>
                <option value="private_event">包場</option>
                <option value="special_hours">特殊營業時間</option>
                <option value="holiday">假日定價</option>
                <option value="peak">尖峰</option>
              </select>
            </label>
            <Field name="name" label="名稱" placeholder="公休 / 維護" />
            <label className="flex items-end gap-3 rounded-lg border border-line bg-sunken px-3 py-2">
              <input name="allDay" type="checkbox" className="mb-1 size-4 accent-brand" />
              <span className="text-sm text-ink-2">整天</span>
            </label>
            <Field name="startTime" label="開始時間" type="time" defaultValue="13:00" />
            <Field name="endTime" label="結束時間" type="time" defaultValue="19:00" />
            <Field name="priceMultiplier" label="價格倍率" type="number" min={0} step="0.1" defaultValue="1" />
            <Field name="description" label="描述" />
          </div>
          <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
            <button type="submit" disabled={createSpecialDate.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
              {createSpecialDate.isPending ? '新增中...' : '建立特殊日期'}
            </button>
          </div>
        </form>
      )}
      {message && <p className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info-subtle-ink">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-lg border border-line bg-surface shadow-quiet">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-xl text-ink">{weekLabel}</h2>
              <p className="mt-1 text-sm text-ink-3">
                {studios.find((studio) => studio.id === activeStudioId)?.name ?? '尚未選擇攝影棚'} · 週視圖
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-7">
            {weekDays.map((day) => {
              const bookingsOfDay = (bookingPage?.items ?? []).filter((booking) =>
                booking.studioId === activeStudioId &&
                booking.startAt.slice(0, 10) === day.iso &&
                isActiveBooking(booking.status),
              )
              const selected = selectedDate === day.iso
              return (
              <button
                type="button"
                key={day.iso}
                onClick={() => setSelectedDate(day.iso)}
                className={`min-h-40 bg-surface p-4 text-left transition-colors hover:bg-sunken ${selected ? 'ring-2 ring-inset ring-brand' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-ink-3">{day.weekday}</p>
                    <h3 className="mt-1 text-lg font-medium text-ink">{day.label}</h3>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${bookingsOfDay.length > 0 ? stateClass.limited : stateClass.available}`}>
                    {bookingsOfDay.length > 0 ? '有預約' : '可查看'}
                  </span>
                </div>
                <div className="mt-6 space-y-2">
                  {bookingsOfDay.slice(0, 3).map((booking) => (
                    <TimeSlot key={booking.id} time={formatBookingTime(booking.startAt, booking.endAt)} active />
                  ))}
                  {bookingsOfDay.length === 0 && <TimeSlot time="點擊查看時段" active />}
                </div>
                <p className="mt-4 text-xs text-ink-3">已訂 {bookingsOfDay.length} 筆</p>
              </button>
            )})}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">{selectedDate} 時段</h2>
            <form key={`${activeStudioId}-${activeStudio?.defaultHourlyPrice ?? ''}`} onSubmit={onCreateTimeSlots} className="mt-4 rounded-lg border border-line bg-sunken p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-end gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <input name="allDay" type="checkbox" className="mb-1 size-4 accent-brand" />
                  <span className="text-sm text-ink-2">整天</span>
                </label>
                <Field name="intervalMinutes" label="時段長度" type="number" min={15} step="15" defaultValue="60" />
                <Field name="startTime" label="開始時間" type="time" defaultValue="00:00" />
                <Field name="endTime" label="結束時間" type="time" defaultValue="23:00" />
                <Field
                  name="hourlyPrice"
                  label="每小時價格"
                  type="number"
                  min={0}
                  defaultValue={String(activeStudio?.defaultHourlyPrice ?? '')}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onResetTimeSlots}
                  disabled={!activeStudioId || resetTimeSlots.isPending || daySlots.isLoading}
                  className="h-10 rounded-lg border border-danger px-4 text-sm text-danger hover:bg-danger-subtle disabled:opacity-60"
                >
                  {resetTimeSlots.isPending ? '清除中...' : '重設時段'}
                </button>
                <button
                  type="submit"
                  disabled={!activeStudioId || createTimeSlots.isPending}
                  className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60"
                >
                  {createTimeSlots.isPending ? '產生中...' : '產生預約時段'}
                </button>
              </div>
            </form>
            <div className="mt-4 space-y-3">
              {daySlots.isLoading && <p className="text-sm text-ink-3">載入中...</p>}
              {!daySlots.isLoading && (daySlots.data?.length ?? 0) === 0 && (
                <p className="text-sm text-ink-3">此日尚無 time_slots。24H 營業設定不會自動產生可預約時段，需要另行產生 time_slots。</p>
              )}
              {daySlots.data?.map((slot) => (
                <MinuteRule
                  key={slot.id}
                  label={slotStatus(slot, selectedDateBookings)}
                  display={`${formatMinute(slot.start_minute)}-${formatMinute(slot.end_minute)}`}
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">近期需寄送電子鎖</h2>
            <div className="mt-4 divide-y divide-line">
              {confirmedBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-ink">{booking.customerName}</p>
                    <p className="mt-1 text-xs text-ink-3">{formatBookingDateTime(booking.startAt, booking.endAt)}</p>
                  </div>
                  <span className="rounded-full bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning-subtle-ink">
                    待填寫
                  </span>
                </div>
              ))}
              {confirmedBookings.length === 0 && (
                <div className="py-6 text-center text-sm text-ink-3">目前沒有已確認預約。</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required,
  min,
  step,
  defaultValue,
  placeholder,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  min?: number
  step?: string
  defaultValue?: string
  placeholder?: string
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand"
      />
    </label>
  )
}

function formatBookingDateTime(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const date = `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}`
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  return `${date} ${startTime}-${endTime}`
}

function formatBookingTime(startAt: string, endAt: string): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
}

function buildWeekDays(weekOffset: number) {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - today.getDay() + weekOffset * 7)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      iso: formatLocalDate(date),
      label: `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`,
      weekday: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
    }
  })
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayRange(date: string) {
  const start = `${date}T00:00:00Z`
  const endDate = new Date(start)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  return { start, end: endDate.toISOString() }
}

function toApiDateTime(date: string): string {
  return `${date}T00:00:00Z`
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function timeToMinute(time: string): number {
  const [hour = '0', minute = '0'] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

function dateToMinute(value: string): number {
  const date = new Date(value)
  return date.getHours() * 60 + date.getMinutes()
}

function TimeSlot({ time, active }: { time: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${active ? 'border-line bg-sunken text-ink-2' : 'border-line bg-neutral-subtle text-ink-3'}`}>
      {active ? <Clock className="size-3.5" /> : <Lock className="size-3.5" />}
      {time}
    </div>
  )
}

function MinuteRule({ label, display }: { label: string; display: string }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 text-sm ${slotRuleClass[label] ?? slotRuleClass.available}`}>
      <span className="font-medium">{label}</span>
      <span className="font-medium text-ink">{display}</span>
    </div>
  )
}

function slotStatus(slot: RawTimeSlot, bookings: { startAt: string; endAt: string }[]): string {
  const overlapsBooking = bookings.some((booking) => {
    const start = dateToMinute(booking.startAt)
    const end = dateToMinute(booking.endAt)
    return slot.start_minute < end && slot.end_minute > start
  })
  return overlapsBooking ? 'booked' : (slot.status ?? 'available')
}

function isActiveBooking(status: string): boolean {
  return status !== 'cancelled' && status !== 'no_show'
}

const stateClass: Record<string, string> = {
  available: 'bg-success-subtle text-success-subtle-ink',
  limited: 'bg-warning-subtle text-warning-subtle-ink',
  full: 'bg-neutral-subtle text-neutral-subtle-ink',
  closed: 'bg-neutral-subtle text-neutral-subtle-ink',
  maintenance: 'bg-info-subtle text-info-subtle-ink',
}

const slotRuleClass: Record<string, string> = {
  available: 'border-line bg-sunken text-ink-2',
  booked: 'border-success bg-success-subtle text-success-subtle-ink',
  held: 'border-warning bg-warning-subtle text-warning-subtle-ink',
  blocked: 'border-neutral bg-neutral-subtle text-neutral-subtle-ink',
  maintenance: 'border-info bg-info-subtle text-info-subtle-ink',
}
