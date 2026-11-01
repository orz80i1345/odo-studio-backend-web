import { Percent, Plus, Search, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { ApiError, Spinner, bookingsApi, type Booking } from '@studio/shared'
import { api } from '../lib'
import { writeActivityLog } from '../activity'
import { formatCurrency } from '../data/adminMock'

interface RawDiscountCode {
  id: number
  code: string
  name?: string
  discount_type: 'hourly_fixed' | 'fixed_amount' | 'percent'
  discount_amount: number
  is_active?: boolean
  metadata?: Record<string, unknown>
}

interface CommissionSummary {
  paidBookings: number
  unsettledAmount: number
  settledAmount: number
  entries: Array<{
    booking: Booking
    amount: number
    settledAt?: string
  }>
}

const queryKey = ['admin', 'discount-codes'] as const
const commissionBookingsQueryKey = ['admin', 'discount-code-commission-bookings'] as const

export function DiscountCodePage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedCodeId, setExpandedCodeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { data: commissionBookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: commissionBookingsQueryKey,
    queryFn: async () => {
      const bookings: Booking[] = []
      let page = 1
      while (true) {
        const result = await bookingsApi.listMyBookings(api, { page, pageSize: 100, paymentStatus: 'paid' })
        bookings.push(...result.items)
        if (bookings.length >= result.total || result.items.length === 0) return bookings
        page += 1
      }
    },
  })

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ data: RawDiscountCode[] }>('/public/discount_codes', {
        pageSize: 100,
        sort: 'code_asc',
      })
      return res.data ?? []
    },
  })

  const codes = data ?? []
  const commissionByCode = useMemo(() => {
    const summaries = new Map<string, CommissionSummary>()
    for (const code of codes) {
      const partnerName = metadataString(code.metadata, 'commission_partner_name')
      const baseRate = metadataNumber(code.metadata, 'commission_base_rate')
      if (code.discount_type !== 'percent' || !partnerName || baseRate == null) continue

      const matchingBookings = commissionBookings.filter((booking) =>
        booking.discountCode?.toUpperCase() === code.code.toUpperCase() &&
        booking.paymentStatus === 'paid' &&
        booking.status !== 'cancelled',
      )
      const entries = matchingBookings.map((booking) => ({
        booking,
        amount: commissionAmountForBooking(booking, code, baseRate),
        settledAt: metadataString(booking.metadata, 'commission_settled_at'),
      }))
      const unsettledAmount = entries
        .filter((entry) => !entry.settledAt)
        .reduce((sum, entry) => sum + entry.amount, 0)
      const settledAmount = entries
        .filter((entry) => entry.settledAt)
        .reduce((sum, entry) => sum + entry.amount, 0)
      summaries.set(code.code.toUpperCase(), {
        paidBookings: matchingBookings.length,
        unsettledAmount,
        settledAmount,
        entries,
      })
    }
    return summaries
  }, [codes, commissionBookings])
  const filteredCodes = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return codes
    return codes.filter((item) => [item.code, item.name ?? '', metadataString(item.metadata, 'commission_partner_name') ?? '']
      .some((value) => value.toLowerCase().includes(needle)))
  }, [codes, search])

  const createCode = useMutation({
    mutationFn: (input: Omit<RawDiscountCode, 'id'>) => api.post<{ data: RawDiscountCode }>('/discount_codes', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setIsCreateOpen(false)
    },
  })

  const updateCode = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Omit<RawDiscountCode, 'id'> }) =>
      api.patch<{ data: RawDiscountCode }>(`/discount_codes/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setEditingId(null)
    },
  })

  const deleteCode = useMutation({
    mutationFn: (id: number) => api.delete(`/discount_codes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const settleCommission = useMutation({
    mutationFn: async ({ booking, amount, settled }: { booking: Booking; amount: number; settled: boolean }) => {
      const settledAt = settled ? new Date().toISOString() : undefined
      const metadata = {
        ...booking.metadata,
        commission_amount: amount,
        commission_settled_at: settledAt,
      }
      await api.patch(`/bookings/${booking.id}`, { metadata: JSON.stringify(metadata) })
      await writeActivityLog(api, {
        action: settled ? 'settle_commission' : 'reopen_commission',
        entityType: 'booking',
        entityId: Number(booking.id),
        changes: { discountCode: booking.discountCode, commissionAmount: amount, commissionSettledAt: settledAt ?? null },
      })
      return { booking, settled }
    },
    onSuccess: ({ booking, settled }) => {
      qc.invalidateQueries({ queryKey: commissionBookingsQueryKey })
      setError(null)
      setMessage(`${booking.bookingNumber} 回佣已標記為${settled ? '已結算' : '未結算'}。`)
    },
    onError: (e) => setError(e instanceof Error ? e.message : '更新回佣結算狀態失敗'),
  })

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setError(null)
      setMessage(null)
      const input = formToPayload(form)
      const created = await createCode.mutateAsync(input)
      await writeActivityLog(api, {
        action: 'create_discount_code',
        entityType: 'discount_code',
        entityId: Number(created.data.id),
        changes: input,
      })
      setMessage(`折扣碼 ${created.data.code} 已建立。`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增折扣碼失敗')
    }
  }

  async function onUpdate(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setError(null)
      setMessage(null)
      const input = formToPayload(form, codes.find((item) => item.id === id)?.metadata)
      const updated = await updateCode.mutateAsync({ id, input })
      await writeActivityLog(api, {
        action: 'update_discount_code',
        entityType: 'discount_code',
        entityId: Number(updated.data.id),
        changes: input,
      })
      setMessage(`折扣碼 ${updated.data.code} 已更新。`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新折扣碼失敗')
    }
  }

  async function onDelete(item: RawDiscountCode) {
    if (!window.confirm(`確定刪除折扣碼 ${item.code}？既有訂單上的折扣紀錄不會受影響。`)) return
    try {
      setError(null)
      setMessage(null)
      await deleteCode.mutateAsync(item.id)
      await writeActivityLog(api, {
        action: 'delete_discount_code',
        entityType: 'discount_code',
        entityId: item.id,
        changes: { code: item.code },
      })
      setMessage(`折扣碼 ${item.code} 已刪除。`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '刪除折扣碼失敗')
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Discount Codes</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">折扣碼管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理折扣碼與合作夥伴回佣。百分比類型請以 7、8、9 表示七、八、九折。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover"
        >
          <Plus className="size-4" />
          新增折扣碼
        </button>
      </div>

      {error && <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{error}</p>}
      {message && <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success-subtle-ink">{message}</p>}

      {isCreateOpen && (
        <form onSubmit={onCreate} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <DiscountCodeFields />
          <div className="mt-4 flex justify-end">
            <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
              建立折扣碼
            </button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-line bg-surface shadow-quiet">
        <div className="border-b border-line p-4">
          <label className="flex h-10 max-w-xl items-center gap-2 rounded-lg border border-line bg-sunken px-3 text-sm text-ink-3">
            <Search className="size-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
              placeholder="搜尋折扣碼、名稱或合作夥伴"
            />
          </label>
        </div>

        <div className="grid divide-y divide-line">
          {isLoading && <div className="p-10 text-center text-ink-3"><Spinner /></div>}
          {!isLoading && filteredCodes.length === 0 && (
            <div className="p-10 text-center text-sm text-ink-3">目前沒有折扣碼。</div>
          )}
          {filteredCodes.map((item) => (
            <article key={item.id} className="p-5">
              {editingId === item.id ? (
                <form onSubmit={(event) => onUpdate(event, item.id)} className="space-y-4">
                  <DiscountCodeFields item={item} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                      取消
                    </button>
                    <button type="submit" className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-on hover:bg-brand-hover">
                      儲存
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
                    <div className="flex gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand-subtle-ink">
                        <Percent className="size-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-medium text-ink">{item.code}</h2>
                          <span className={item.is_active === false ? 'rounded-full bg-danger-subtle px-2 py-0.5 text-xs text-danger-subtle-ink' : 'rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success-subtle-ink'}>
                            {item.is_active === false ? '停用' : '啟用'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink-3">{item.name ?? '未命名折扣碼'}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-sunken px-4 py-3 text-sm">
                      <div className="text-xs text-ink-3">折扣</div>
                      <div className="mt-1 font-medium text-ink">{labelForDiscount(item)}</div>
                    </div>
                    {commissionDetails(item, commissionByCode.get(item.code.toUpperCase()), bookingsLoading)}
                    <div className="flex justify-end gap-2">
                      {commissionByCode.has(item.code.toUpperCase()) && (
                        <button
                          type="button"
                          onClick={() => setExpandedCodeId((id) => id === item.id ? null : item.id)}
                          className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
                        >
                          {expandedCodeId === item.id ? '收起明細' : '回佣明細'}
                        </button>
                      )}
                      <button type="button" onClick={() => setEditingId(item.id)} className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                        編輯
                      </button>
                      <button type="button" onClick={() => onDelete(item)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/50 px-3 text-sm text-danger hover:bg-danger-subtle">
                        <Trash2 className="size-4" />
                        刪除
                      </button>
                    </div>
                  </div>
                  {expandedCodeId === item.id && (
                    <CommissionEntries
                      summary={commissionByCode.get(item.code.toUpperCase())}
                      isUpdating={settleCommission.isPending}
                      onSettle={(booking, amount, settled) => settleCommission.mutate({ booking, amount, settled })}
                    />
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function DiscountCodeFields({ item }: { item?: RawDiscountCode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
      <Field name="code" label="折扣碼" defaultValue={item?.code ?? ''} required />
      <Field name="name" label="名稱" defaultValue={item?.name ?? ''} />
      <label>
        <span className="mb-2 block text-sm text-ink-2">類型</span>
        <select name="discountType" defaultValue={item?.discount_type ?? 'hourly_fixed'} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
          <option value="hourly_fixed">每小時固定折抵</option>
          <option value="fixed_amount">總金額固定折抵</option>
          <option value="percent">折數（7 / 8 / 9 折）</option>
        </select>
      </label>
      <Field name="discountAmount" label="折扣值（折數填 7 / 8 / 9）" type="number" min="0" defaultValue={String(item?.discount_amount ?? 300)} required />
      <Field name="partnerName" label="合作夥伴" defaultValue={metadataString(item?.metadata, 'commission_partner_name') ?? ''} />
      <Field name="commissionBaseRate" label="夥伴底價折數" type="number" min="0" defaultValue={String(metadataNumber(item?.metadata, 'commission_base_rate') ?? '')} />
      <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
        <input name="isActive" type="checkbox" defaultChecked={item?.is_active ?? true} className="size-4 accent-brand" />
        啟用
      </label>
    </div>
  )
}

function Field({ name, label, defaultValue = '', type = 'text', required, min }: {
  name: string
  label: string
  defaultValue?: string
  type?: string
  required?: boolean
  min?: string
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        min={min}
        required={required}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
    </label>
  )
}

function formToPayload(form: FormData, existingMetadata: Record<string, unknown> = {}): Omit<RawDiscountCode, 'id'> {
  const discountType = String(form.get('discountType') ?? 'hourly_fixed') as RawDiscountCode['discount_type']
  const discountAmount = Math.max(0, Number(form.get('discountAmount') ?? 0))
  const partnerName = String(form.get('partnerName') ?? '').trim()
  const baseRateValue = String(form.get('commissionBaseRate') ?? '').trim()
  const commissionBaseRate = baseRateValue === '' ? undefined : Number(baseRateValue)
  if (discountType === 'percent' && (discountAmount < 1 || discountAmount > 10)) {
    throw new Error('折數請輸入 1 至 10，例如 8 代表八折。')
  }
  if (partnerName && discountType !== 'percent') throw new Error('回佣機制目前僅適用於百分比折扣。')
  if (partnerName && (commissionBaseRate == null || !Number.isFinite(commissionBaseRate))) {
    throw new Error('請輸入合作夥伴的底價折數。')
  }
  if (commissionBaseRate != null && (commissionBaseRate < 0 || commissionBaseRate > discountAmount)) {
    throw new Error('夥伴底價折數不能高於客戶折數。')
  }
  return {
    code: String(form.get('code') ?? '').trim().toUpperCase(),
    name: String(form.get('name') ?? '').trim() || undefined,
    discount_type: discountType,
    discount_amount: Math.round(discountAmount * 100) / 100,
    is_active: form.get('isActive') === 'on',
    metadata: {
      ...existingMetadata,
      commission_partner_name: partnerName || undefined,
      commission_base_rate: partnerName ? commissionBaseRate : undefined,
    },
  }
}

function labelForDiscount(item: RawDiscountCode) {
  if (item.discount_type === 'hourly_fixed') return `每小時折 NT$ ${Number(item.discount_amount).toLocaleString()}`
  if (item.discount_type === 'fixed_amount') return `總金額折 NT$ ${Number(item.discount_amount).toLocaleString()}`
  return `${Number(item.discount_amount).toLocaleString()} 折`
}

function commissionDetails(item: RawDiscountCode, summary?: CommissionSummary, loading?: boolean) {
  const partnerName = metadataString(item.metadata, 'commission_partner_name')
  const baseRate = metadataNumber(item.metadata, 'commission_base_rate')
  if (item.discount_type !== 'percent' || !partnerName || baseRate == null) return null
  return (
    <div className="rounded-lg bg-brand-subtle px-4 py-3 text-sm text-brand-subtle-ink">
      <div className="text-xs opacity-75">{partnerName} · 底價 {baseRate} 折</div>
      <div className="mt-1 font-medium">
        {loading ? '計算中…' : `待結算 ${formatCurrency(summary?.unsettledAmount ?? 0)}`}
      </div>
      {!loading && (
        <div className="mt-1 text-xs opacity-75">
          已結算 {formatCurrency(summary?.settledAmount ?? 0)} · {summary?.paidBookings ?? 0} 筆
        </div>
      )}
    </div>
  )
}

function CommissionEntries({ summary, isUpdating, onSettle }: {
  summary?: CommissionSummary
  isUpdating: boolean
  onSettle: (booking: Booking, amount: number, settled: boolean) => void
}) {
  if (!summary || summary.entries.length === 0) {
    return <div className="rounded-lg border border-line bg-sunken p-4 text-sm text-ink-3">目前沒有已付款的回佣訂單。</div>
  }
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-sunken px-4 py-2 text-xs text-ink-3">
        <span>訂單</span>
        <span>回佣</span>
        <span>結算狀態</span>
        <span>操作</span>
      </div>
      <div className="divide-y divide-line">
        {summary.entries.map(({ booking, amount, settledAt }) => (
          <div key={booking.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-medium text-ink">{booking.bookingNumber}</div>
              <div className="mt-0.5 text-xs text-ink-3">{booking.customerName} · {new Date(booking.startAt).toLocaleDateString('zh-TW')}</div>
            </div>
            <div className="font-medium text-ink">{formatCurrency(amount)}</div>
            <div>
              <span className={settledAt
                ? 'rounded-full bg-success-subtle px-2 py-1 text-xs text-success-subtle-ink'
                : 'rounded-full bg-warning-subtle px-2 py-1 text-xs text-warning-subtle-ink'}>
                {settledAt ? '已結算' : '未結算'}
              </span>
              {settledAt && <div className="mt-1 text-xs text-ink-3">{formatDateTime(settledAt)}</div>}
            </div>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onSettle(booking, amount, !settledAt)}
              className="h-8 rounded-lg border border-line px-3 text-xs text-ink-2 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settledAt ? '改為未結算' : '標記已結算'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function commissionAmountForBooking(booking: Booking, code: RawDiscountCode, baseRate: number) {
  const snapshotAmount = metadataNumber(booking.metadata, 'commission_amount')
  if (snapshotAmount != null) return Math.max(0, snapshotAmount)
  return Math.max(0, Math.round(booking.subtotal * (Number(code.discount_amount) - baseRate) / 10))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value))
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = Number(metadata?.[key])
  return metadata?.[key] !== '' && metadata?.[key] != null && Number.isFinite(value) ? value : undefined
}
