import { ChevronLeft, ChevronRight, Clock, Lock, Plus } from 'lucide-react'
import { bookings, scheduleDays } from '../data/adminMock'

export function SchedulePage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Schedule</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">日曆與時段管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">以分鐘數管理營業時間、可預約時段、公休日、維護與包場日。</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
          <Plus className="size-4" />
          新增特殊日期
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-lg border border-line bg-surface shadow-quiet">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-xl text-ink">2026 年 7 月</h2>
              <p className="mt-1 text-sm text-ink-3">北窗棚 · 週視圖</p>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken">
                <ChevronLeft className="size-4" />
              </button>
              <button className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-7">
            {scheduleDays.map((day) => (
              <article key={day.date} className="min-h-40 bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-ink-3">{day.day}</p>
                    <h3 className="mt-1 text-lg font-medium text-ink">{day.date}</h3>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${stateClass[day.state]}`}>{day.title}</span>
                </div>
                <div className="mt-6 space-y-2">
                  <TimeSlot time="09:00-12:00" active={day.state !== 'closed'} />
                  <TimeSlot time="14:00-17:00" active={day.state === 'available' || day.state === 'limited'} />
                  <TimeSlot time="18:00-21:00" active={day.state === 'available'} />
                </div>
                <p className="mt-4 text-xs text-ink-3">已訂 {day.count}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">時段設定</h2>
            <div className="mt-4 space-y-3">
              <MinuteRule label="營業開始" minute={540} display="09:00" />
              <MinuteRule label="營業結束" minute={1260} display="21:00" />
              <MinuteRule label="預約單位" minute={60} display="60 分鐘" />
              <MinuteRule label="最短預約" minute={120} display="120 分鐘" />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">近期需寄送電子鎖</h2>
            <div className="mt-4 divide-y divide-line">
              {bookings.filter((booking) => booking.bookingStatus === 'confirmed').map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-ink">{booking.customer}</p>
                    <p className="mt-1 text-xs text-ink-3">{booking.date} {booking.time}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${booking.lockCode ? 'bg-success-subtle text-success-subtle-ink' : 'bg-warning-subtle text-warning-subtle-ink'}`}>
                    {booking.lockCode ? '已填寫' : '待填寫'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

function TimeSlot({ time, active }: { time: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${active ? 'border-line bg-sunken text-ink-2' : 'border-line bg-neutral-subtle text-ink-3'}`}>
      {active ? <Clock className="size-3.5" /> : <Lock className="size-3.5" />}
      {time}
    </div>
  )
}

function MinuteRule({ label, minute, display }: { label: string; minute: number; display: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-sunken p-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="font-medium text-ink">{display}</span>
      <code className="rounded bg-surface px-2 py-1 text-xs text-ink-3">{minute}</code>
    </div>
  )
}

const stateClass: Record<string, string> = {
  available: 'bg-success-subtle text-success-subtle-ink',
  limited: 'bg-warning-subtle text-warning-subtle-ink',
  full: 'bg-neutral-subtle text-neutral-subtle-ink',
  closed: 'bg-neutral-subtle text-neutral-subtle-ink',
  maintenance: 'bg-info-subtle text-info-subtle-ink',
}
