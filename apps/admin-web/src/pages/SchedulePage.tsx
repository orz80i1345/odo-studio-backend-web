import { CalendarDays, ChevronLeft, ChevronRight, Clock, Lock, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { writeActivityLog } from '../activity'
import { useAdminBookings, useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

interface RawTimeSlot {
  id: number
  studio_id: number
  slot_date: string
  start_minute: number
  end_minute: number
  status?: string
  booking_id?: number | null
  hourly_price?: number
  block_reason?: string | null
  metadata?: string
}

interface RawBusinessHour {
  id: number
  studio_id: number
  weekday: number
}

interface RawSpecialDate {
  id: number
  studio_id?: number | null
  special_date: string
  date_type: string
  name?: string | null
  start_minute?: number | null
  end_minute?: number | null
}

interface RawStudioDailyAvailability {
  id: number
  studio_id: number
  availability_date: string
}

interface CreateSpecialDateInput {
  studio_id: number
  special_date: string
  date_type: string
  name?: string
  description?: string
  start_minute: number
  end_minute: number
  price_multiplier: number
  is_recurring: boolean
  metadata: string
}

export function SchedulePage() {
  const qc = useQueryClient()
  const timeSlotFormRef = useRef<HTMLFormElement>(null)
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
  const specialDatesQueryKey = useMemo(() => [
    'admin',
    'special-dates',
    activeStudioId,
    weekDays[0]?.iso,
    weekDays[6]?.iso,
  ] as const, [activeStudioId, weekDays])
  const daySlots = useQuery({
    queryKey: ['admin', 'time-slots', activeStudioId, selectedDate],
    enabled: !!activeStudioId && !!selectedDate,
    queryFn: () => fetchDayTimeSlots(Number(activeStudioId), selectedDate),
  })
  const specialDates = useQuery({
    queryKey: specialDatesQueryKey,
    enabled: !!activeStudioId && weekDays.length > 0,
    queryFn: () => fetchSpecialDates(Number(activeStudioId), weekDays[0].iso, weekDays[6].iso),
  })
  const specialDatesByDate = useMemo(() => {
    const map = new Map<string, RawSpecialDate[]>()
    for (const item of specialDates.data ?? []) {
      const date = normalizeApiDate(item.special_date)
      map.set(date, [...(map.get(date) ?? []), item])
    }
    return map
  }, [specialDates.data])
  const createSpecialDate = useMutation({
    mutationFn: async (body: CreateSpecialDateInput) => {
      const res = await api.post<RawSpecialDate | { data: RawSpecialDate }>('/public/special_dates', body)
      const created = unwrapData(res)
      const patchedSlots = await blockAvailableSlotsForSpecialDate(body)
      return { created, patchedSlots }
    },
    onSuccess: async ({ created, patchedSlots }) => {
      const blockedText = patchedSlots.length > 0 ? `，已封鎖 ${patchedSlots.length} 個可預約時段` : ''
      setMessage(`特殊日期已新增${blockedText}`)
      writeActivityLog(api, {
        action: 'create_special_date',
        entityType: 'special_date',
        entityId: created.id,
        changes: { date: normalizeApiDate(created.special_date), type: created.date_type, blockedSlots: patchedSlots.length },
      })
      qc.setQueryData<RawSpecialDate[]>(specialDatesQueryKey, (current = []) => {
        if (!activeStudioId || !weekDays[0] || !weekDays[6]) return current
        const date = normalizeApiDate(created.special_date)
        const sameStudio = !created.studio_id || created.studio_id === Number(activeStudioId)
        const inCurrentWeek = date >= weekDays[0].iso && date <= weekDays[6].iso
        if (!sameStudio || !inCurrentWeek) return current
        return [created, ...current.filter((item) => item.id !== created.id)]
      })
      qc.setQueryData<RawTimeSlot[]>(['admin', 'time-slots', activeStudioId, selectedDate], (current = []) => {
        if (patchedSlots.length === 0) return current
        const patchedMap = new Map(patchedSlots.map((slot) => [slot.id, slot]))
        return current.map((slot) => patchedMap.get(slot.id) ?? slot)
      })
      qc.invalidateQueries({ queryKey: ['admin', 'special-dates'] })
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots'] })
      await syncDailyAvailability(Number(created.studio_id ?? activeStudioId), normalizeApiDate(created.special_date))
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
      dates: string[]
      startMinute: number
      endMinute: number
      intervalMinutes: number
      hourlyPrice?: number
    }) => {
      const dates = [...new Set(input.dates)].sort()
      if (dates.length === 0) return { created: 0, skippedClosed: 0, days: 0, createdSlots: [] }
      const existingSlots = await fetchRangeTimeSlots(input.studioId, dates[0], dates[dates.length - 1])
      const existingKeys = new Set(existingSlots.map((slot) => `${normalizeApiDate(slot.slot_date)}-${slot.start_minute}-${slot.end_minute}`))
      const blockingDates = new Set(
        (await fetchSpecialDates(input.studioId, dates[0], dates[dates.length - 1]))
          .filter(isBlockingSpecialDate)
          .map((item) => normalizeApiDate(item.special_date)),
      )
      const payload: Array<Omit<RawTimeSlot, 'id'>> = []
      let skippedClosed = 0
      for (const date of dates) {
        if (blockingDates.has(date)) {
          skippedClosed += 1
          continue
        }
        for (let minute = input.startMinute; minute < input.endMinute; minute += input.intervalMinutes) {
          const endMinute = Math.min(minute + input.intervalMinutes, input.endMinute)
          if (existingKeys.has(`${date}-${minute}-${endMinute}`) || endMinute <= minute) continue
          payload.push({
            studio_id: input.studioId,
            slot_date: toApiDateTime(date),
            start_minute: minute,
            end_minute: endMinute,
            status: 'available',
            hourly_price: input.hourlyPrice,
            metadata: '{}',
          })
        }
      }
      let createdSlots: RawTimeSlot[] = []
      if (payload.length > 0) {
        const res = await api.post<RawTimeSlot[] | { data: RawTimeSlot[] } | undefined>('/public/time_slots/batch', payload)
        const body = res ? unwrapData(res) : undefined
        createdSlots = Array.isArray(body) && body.length > 0
          ? body
          : payload.map((slot, index) => ({ id: -Date.now() - index, ...slot }))
      }
      return { created: payload.length, skippedClosed, days: dates.length, createdSlots: createdSlots ?? [] }
    },
    onSuccess: async ({ created, skippedClosed, days, createdSlots }) => {
      const skippedText = skippedClosed > 0 ? `，略過 ${skippedClosed} 個特殊日期` : ''
      setMessage(created > 0 ? `已為 ${days} 天產生 ${created} 個預約時段${skippedText}` : `沒有新增時段${skippedText}`)
      qc.setQueryData<RawTimeSlot[]>(['admin', 'time-slots', activeStudioId, selectedDate], (current = []) => {
        const selectedDateSlots = createdSlots.filter((slot) => normalizeApiDate(slot.slot_date) === selectedDate)
        if (selectedDateSlots.length === 0) return current
        const existingKeys = new Set(current.map((slot) => `${slot.start_minute}-${slot.end_minute}`))
        return [...current, ...selectedDateSlots.filter((slot) => !existingKeys.has(`${slot.start_minute}-${slot.end_minute}`))]
          .sort((a, b) => a.start_minute - b.start_minute)
      })
      writeActivityLog(api, {
        action: 'create_time_slots',
        entityType: 'time_slots',
        entityId: Number(activeStudioId),
        changes: { date: selectedDate, days, created, skippedClosed },
      })
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots'] })
      const dates = [...new Set(createdSlots.map((slot) => normalizeApiDate(slot.slot_date)))]
      await Promise.all(dates.map((date) => syncDailyAvailability(Number(activeStudioId), date)))
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
    onSuccess: async (deleted) => {
      setMessage(`已清除 ${deleted} 個預約時段`)
      qc.invalidateQueries({ queryKey: ['admin', 'time-slots', activeStudioId, selectedDate] })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
      if (activeStudioId) await syncDailyAvailability(Number(activeStudioId), selectedDate)
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
    const studioId = Number(form.get('studioId') || activeStudioId)
    if (!studioId) {
      setMessage('請先選擇攝影棚')
      return
    }
    if (endMinute <= startMinute) {
      setMessage('結束時間必須晚於開始時間')
      return
    }
    createSpecialDate.mutate({
      studio_id: studioId,
      special_date: toApiDateTime(String(form.get('specialDate'))),
      date_type: String(form.get('dateType')),
      name: String(form.get('name') ?? '').trim() || undefined,
      description: String(form.get('description') ?? '').trim() || undefined,
      start_minute: startMinute,
      end_minute: endMinute,
      price_multiplier: Number(form.get('priceMultiplier') || 1),
      is_recurring: false,
      metadata: '{}',
    })
  }

  function onCreateTimeSlots(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeStudioId) return
    const form = new FormData(event.currentTarget)
    const config = getTimeSlotFormConfig(form)
    if (config.endMinute <= config.startMinute) {
      setMessage('結束時間必須晚於開始時間')
      return
    }
    createTimeSlots.mutate({
      studioId: Number(activeStudioId),
      dates: [selectedDate],
      ...config,
    })
  }

  function onCreateFutureTimeSlots(dayCount: number) {
    if (!activeStudioId || !timeSlotFormRef.current) return
    const form = new FormData(timeSlotFormRef.current)
    const config = getTimeSlotFormConfig(form)
    if (config.endMinute <= config.startMinute) {
      setMessage('結束時間必須晚於開始時間')
      return
    }
    const dates = buildFutureDates(selectedDate, dayCount)
    const endDate = dates[dates.length - 1]
    if (!window.confirm(`確定用目前表單設定產生 ${selectedDate} 到 ${endDate} 的預約時段？已存在時段與公休/維護/包場日會略過。`)) return
    createTimeSlots.mutate({
      studioId: Number(activeStudioId),
      dates,
      ...config,
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
              <select name="studioId" defaultValue={activeStudioId ?? ''} required className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                {studioPage?.items.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
              </select>
            </label>
            <Field name="specialDate" label="日期" type="date" required defaultValue={selectedDate} />
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
            <Field name="startTime" label="開始時間" defaultValue="13:00" placeholder="13:00" />
            <Field name="endTime" label="結束時間" defaultValue="19:00" placeholder="19:00" />
            <Field name="priceMultiplier" label="價格倍率" type="number" min={0} step="0.1" defaultValue="1" />
            <Field name="description" label="描述" />
          </div>
          <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
            <button type="submit" disabled={!activeStudioId || createSpecialDate.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
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
              const specialDateOfDay = specialDatesByDate.get(day.iso)?.[0]
              const selected = selectedDate === day.iso
              return (
              <button
                type="button"
                key={day.iso}
                onClick={() => setSelectedDate(day.iso)}
                className={`min-h-40 bg-surface p-4 text-left transition-colors hover:bg-sunken ${specialDateOfDay ? specialDateSurfaceClass(specialDateOfDay.date_type) : ''} ${selected ? 'ring-2 ring-inset ring-brand' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-ink-3">{day.weekday}</p>
                    <h3 className="mt-1 text-lg font-medium text-ink">{day.label}</h3>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${specialDateOfDay ? stateClass[specialDateOfDay.date_type] ?? stateClass.maintenance : bookingsOfDay.length > 0 ? stateClass.limited : stateClass.available}`}>
                    {specialDateOfDay ? specialDateLabel(specialDateOfDay) : bookingsOfDay.length > 0 ? '有預約' : '可查看'}
                  </span>
                </div>
                {specialDateOfDay && (
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-line bg-surface/80 px-2 py-1.5 text-xs text-ink-2">
                    <CalendarDays className="size-3.5" />
                    <span>{specialDateDescription(specialDateOfDay)}</span>
                  </div>
                )}
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
            <form ref={timeSlotFormRef} key={`${activeStudioId}-${activeStudio?.defaultHourlyPrice ?? ''}`} onSubmit={onCreateTimeSlots} className="mt-4 rounded-lg border border-line bg-sunken p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-end gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <input name="allDay" type="checkbox" className="mb-1 size-4 accent-brand" />
                  <span className="text-sm text-ink-2">整天</span>
                </label>
                <Field name="intervalMinutes" label="時段長度" type="number" min={15} step="15" defaultValue="60" />
                <Field name="startTime" label="開始時間" defaultValue="00:00" placeholder="00:00" />
                <Field name="endTime" label="結束時間" defaultValue="23:00" placeholder="23:00" />
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
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onCreateFutureTimeSlots(7)}
                  disabled={!activeStudioId || createTimeSlots.isPending}
                  className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-60"
                >
                  產生未來一週
                </button>
                <button
                  type="button"
                  onClick={() => onCreateFutureTimeSlots(30)}
                  disabled={!activeStudioId || createTimeSlots.isPending}
                  className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-60"
                >
                  產生未來一個月
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

async function fetchDayTimeSlots(studioId: number, date: string) {
  const range = dayRange(date)
  const res = await api.get<{ data: RawTimeSlot[] }>('/public/time_slots', {
    pageSize: 200,
    filter: [
      `studio_id,eq,${studioId}`,
      `slot_date,gte,${range.start}`,
      `slot_date,lt,${range.end}`,
    ],
    sort: 'start_minute',
  })
  return res.data
}

async function blockAvailableSlotsForSpecialDate(input: CreateSpecialDateInput) {
  if (!['closed', 'maintenance', 'private_event'].includes(input.date_type)) return []
  const date = normalizeApiDate(input.special_date)
  const slots = await fetchDayTimeSlots(input.studio_id, date)
  const targetSlots = slots.filter((slot) =>
    slot.status === 'available' &&
    slot.start_minute < input.end_minute &&
    slot.end_minute > input.start_minute,
  )
  const nextStatus = input.date_type === 'maintenance' ? 'maintenance' : 'blocked'
  const reason = specialDateTypeLabel[input.date_type] ?? '特殊日期'
  const patched = await Promise.all(targetSlots.map(async (slot) => {
    const payload = {
      status: nextStatus,
      block_reason: reason,
      metadata: '{}',
    }
    const res = await api.patch<RawTimeSlot | { data: RawTimeSlot } | undefined>(`/public/time_slots/${slot.id}`, payload)
    return res ? unwrapData(res) : { ...slot, ...payload }
  }))
  return patched
}

async function syncDailyAvailability(studioId: number, date: string) {
  const slots = await fetchDayTimeSlots(studioId, date)
  const summary = buildDailyAvailabilityPayload(studioId, date, slots)
  const existing = await api.get<{ data: RawStudioDailyAvailability[] }>('/public/studio_daily_availability', {
    pageSize: 1,
    filter: [
      `studio_id,eq,${studioId}`,
      `availability_date,eq,${toApiDateTime(date)}`,
    ],
  })
  const current = existing.data[0]
  if (current) await api.patch(`/public/studio_daily_availability/${current.id}`, summary)
  else await api.post('/public/studio_daily_availability', summary)
}

function buildDailyAvailabilityPayload(studioId: number, date: string, slots: RawTimeSlot[]) {
  const counts = {
    available: 0,
    held: 0,
    booked: 0,
    blocked: 0,
    maintenance: 0,
    holiday: 0,
  }
  for (const slot of slots) {
    const status = slot.status ?? 'available'
    if (status in counts) counts[status as keyof typeof counts] += 1
  }
  const prices = slots
    .map((slot) => slot.hourly_price)
    .filter((price): price is number => price !== undefined && price !== null)
  const totalCount = slots.length
  const unavailableWithoutBookings = counts.blocked + counts.maintenance + counts.holiday
  return {
    studio_id: studioId,
    availability_date: toApiDateTime(date),
    total_count: totalCount,
    available_count: counts.available,
    held_count: counts.held,
    booked_count: counts.booked,
    blocked_count: counts.blocked,
    maintenance_count: counts.maintenance,
    holiday_count: counts.holiday,
    is_closed: totalCount === 0 || (unavailableWithoutBookings === totalCount && counts.booked === 0 && counts.held === 0),
    open_start_minute: totalCount > 0 ? Math.min(...slots.map((slot) => slot.start_minute)) : undefined,
    open_end_minute: totalCount > 0 ? Math.max(...slots.map((slot) => slot.end_minute)) : undefined,
    min_hourly_price: prices.length > 0 ? Math.min(...prices) : undefined,
    max_hourly_price: prices.length > 0 ? Math.max(...prices) : undefined,
    metadata: '{}',
  }
}

async function fetchRangeTimeSlots(studioId: number, startDate: string, endDate: string) {
  const end = addDays(endDate, 1)
  const items: RawTimeSlot[] = []
  const pageSize = 100
  for (let page = 1; ; page += 1) {
    const res = await api.get<{ data: RawTimeSlot[]; pagination?: { total?: number } }>('/public/time_slots', {
      page,
      pageSize,
      filter: [
        `studio_id,eq,${studioId}`,
        `slot_date,gte,${toApiDateTime(startDate)}`,
        `slot_date,lt,${toApiDateTime(end)}`,
      ],
      sort: 'slot_date,start_minute',
    })
    items.push(...res.data)
    if (items.length >= (res.pagination?.total ?? res.data.length) || res.data.length === 0) break
  }
  return items
}

async function fetchSpecialDates(studioId: number, startDate: string, endDate: string) {
  const end = addDays(endDate, 1)
  const res = await api.get<{ data: RawSpecialDate[] }>('/public/special_dates', {
    pageSize: 500,
    filter: [
      `special_date,gte,${toApiDateTime(startDate)}`,
      `special_date,lt,${toApiDateTime(end)}`,
    ],
    sort: 'special_date',
  })
  return res.data.filter((item) => !item.studio_id || item.studio_id === studioId)
}

function toApiDateTime(date: string): string {
  return `${date}T00:00:00Z`
}

function normalizeApiDate(value: string): string {
  return value.slice(0, 10)
}

function addDays(date: string, amount: number): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

function buildFutureDates(startDate: string, dayCount: number): string[] {
  return Array.from({ length: dayCount }, (_, index) => addDays(startDate, index))
}

function getTimeSlotFormConfig(form: FormData) {
  const isAllDay = form.get('allDay') === 'on'
  return {
    startMinute: isAllDay ? 0 : timeToMinute(String(form.get('startTime') || '00:00')),
    endMinute: isAllDay ? 1440 : timeToMinute(String(form.get('endTime') || '00:00')),
    intervalMinutes: Number(form.get('intervalMinutes') || 60),
    hourlyPrice: form.get('hourlyPrice') ? Number(form.get('hourlyPrice')) : undefined,
  }
}

function formatMinute(minute: number): string {
  const normalized = minute >= 1440 ? 0 : minute
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function timeToMinute(time: string): number {
  const [hour = '0', minute = '0'] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

function dateToMinute(value: string): number {
  const date = new Date(value)
  return date.getHours() * 60 + date.getMinutes()
}

function unwrapData<T>(value: T | { data: T }): T {
  return value && typeof value === 'object' && 'data' in value ? value.data : value
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

function isBlockingSpecialDate(item: RawSpecialDate): boolean {
  return ['closed', 'maintenance', 'private_event'].includes(item.date_type)
}

function specialDateLabel(item: RawSpecialDate): string {
  return item.name?.trim() || specialDateTypeLabel[item.date_type] || '特殊'
}

function specialDateDescription(item: RawSpecialDate): string {
  const label = specialDateTypeLabel[item.date_type] || '特殊日期'
  const time = item.start_minute === null || item.start_minute === undefined || item.end_minute === null || item.end_minute === undefined
    ? '整天'
    : `${formatMinute(item.start_minute)}-${formatMinute(item.end_minute)}`
  return `${label} · ${time}`
}

function specialDateSurfaceClass(type: string): string {
  if (type === 'closed') return 'bg-danger-subtle/30'
  if (type === 'maintenance' || type === 'private_event') return 'bg-info-subtle/40'
  if (type === 'holiday' || type === 'peak') return 'bg-warning-subtle/35'
  return 'bg-sunken'
}

const stateClass: Record<string, string> = {
  available: 'bg-success-subtle text-success-subtle-ink',
  limited: 'bg-warning-subtle text-warning-subtle-ink',
  full: 'bg-neutral-subtle text-neutral-subtle-ink',
  closed: 'bg-neutral-subtle text-neutral-subtle-ink',
  maintenance: 'bg-info-subtle text-info-subtle-ink',
  private_event: 'bg-info-subtle text-info-subtle-ink',
  special_hours: 'bg-success-subtle text-success-subtle-ink',
  holiday: 'bg-warning-subtle text-warning-subtle-ink',
  peak: 'bg-warning-subtle text-warning-subtle-ink',
}

const specialDateTypeLabel: Record<string, string> = {
  closed: '公休',
  maintenance: '維護',
  private_event: '包場',
  special_hours: '特殊營業',
  holiday: '假日定價',
  peak: '尖峰',
}

const slotRuleClass: Record<string, string> = {
  available: 'border-line bg-sunken text-ink-2',
  booked: 'border-success bg-success-subtle text-success-subtle-ink',
  held: 'border-warning bg-warning-subtle text-warning-subtle-ink',
  blocked: 'border-neutral bg-neutral-subtle text-neutral-subtle-ink',
  maintenance: 'border-info bg-info-subtle text-info-subtle-ink',
}
