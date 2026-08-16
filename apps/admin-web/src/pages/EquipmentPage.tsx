import { PackagePlus, Search, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { ApiError, Spinner } from '@studio/shared'
import { api } from '../lib'
import { writeActivityLog } from '../activity'

interface RawEquipmentItem {
  id: number
  name: string
  description?: string
  unit_price: number | string
  image_url?: string
  is_active?: boolean
  display_order?: number
  metadata?: Record<string, unknown>
}

const queryKey = ['admin', 'equipment-items'] as const

export function EquipmentPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get<{ data: RawEquipmentItem[] }>('/public/equipment_items', {
        pageSize: 100,
        sort: 'display_order_asc',
      })
      return res.data ?? []
    },
  })

  const items = data ?? []
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => [item.name, item.description ?? ''].some((value) => value.toLowerCase().includes(needle)))
  }, [items, search])

  const createItem = useMutation({
    mutationFn: (input: Omit<RawEquipmentItem, 'id'>) => api.post<{ data: RawEquipmentItem }>('/public/equipment_items', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setIsCreateOpen(false)
    },
  })

  const updateItem = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Omit<RawEquipmentItem, 'id'> }) =>
      api.patch<{ data: RawEquipmentItem }>(`/public/equipment_items/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setEditingId(null)
    },
  })

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/public/equipment_items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setError(null)
      setMessage(null)
      const input = formToPayload(form)
      const created = await createItem.mutateAsync(input)
      await writeActivityLog(api, {
        action: 'create_equipment_item',
        entityType: 'equipment_item',
        entityId: Number(created.data.id),
        changes: input,
      })
      setMessage(`器材 ${created.data.name} 已建立。`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '新增器材失敗')
    }
  }

  async function onUpdate(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setError(null)
      setMessage(null)
      const input = formToPayload(form)
      const updated = await updateItem.mutateAsync({ id, input })
      await writeActivityLog(api, {
        action: 'update_equipment_item',
        entityType: 'equipment_item',
        entityId: Number(updated.data.id),
        changes: input,
      })
      setMessage(`器材 ${updated.data.name} 已更新。`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '更新器材失敗')
    }
  }

  async function onDelete(item: RawEquipmentItem) {
    if (!window.confirm(`確定刪除器材 ${item.name}？若已有訂單使用此器材，資料庫可能會拒絕刪除。`)) return
    try {
      setError(null)
      setMessage(null)
      await deleteItem.mutateAsync(item.id)
      await writeActivityLog(api, {
        action: 'delete_equipment_item',
        entityType: 'equipment_item',
        entityId: item.id,
        changes: { name: item.name },
      })
      setMessage(`器材 ${item.name} 已刪除。`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '刪除器材失敗')
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Equipment</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">器材管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理前台可加租的器材。每項器材同一個預約時段只能被租借一次。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover"
        >
          <PackagePlus className="size-4" />
          新增器材
        </button>
      </div>

      {error && <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{error}</p>}
      {message && <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success-subtle-ink">{message}</p>}

      {isCreateOpen && (
        <form onSubmit={onCreate} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <EquipmentFields />
          <div className="mt-4 flex justify-end">
            <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
              建立器材
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
              placeholder="搜尋器材名稱或描述"
            />
          </label>
        </div>

        <div className="grid divide-y divide-line">
          {isLoading && <div className="p-10 text-center text-ink-3"><Spinner /></div>}
          {!isLoading && filteredItems.length === 0 && (
            <div className="p-10 text-center text-sm text-ink-3">目前沒有器材。</div>
          )}
          {filteredItems.map((item) => (
            <article key={item.id} className="p-5">
              {editingId === item.id ? (
                <form onSubmit={(event) => onUpdate(event, item.id)} className="space-y-4">
                  <EquipmentFields item={item} />
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
                <div className="grid gap-4 lg:grid-cols-[88px_1fr_auto_auto] lg:items-center">
                  <div className="h-20 overflow-hidden rounded-lg border border-line bg-sunken">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="size-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid size-full place-items-center text-xs text-ink-3">No image</div>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium text-ink">{item.name}</h2>
                      <span className={item.is_active === false ? 'rounded-full bg-danger-subtle px-2 py-0.5 text-xs text-danger-subtle-ink' : 'rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success-subtle-ink'}>
                        {item.is_active === false ? '停用' : '啟用'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-3">{item.description ?? '沒有描述'}</p>
                    <p className="mt-2 text-xs text-ink-3">排序 {item.display_order ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-sunken px-4 py-3 text-sm">
                    <div className="text-xs text-ink-3">價格</div>
                    <div className="mt-1 font-medium text-ink">NT$ {Number(item.unit_price).toLocaleString()}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(item.id)} className="h-9 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                      編輯
                    </button>
                    <button type="button" onClick={() => onDelete(item)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-danger/50 px-3 text-sm text-danger hover:bg-danger-subtle">
                      <Trash2 className="size-4" />
                      刪除
                    </button>
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

function EquipmentFields({ item }: { item?: RawEquipmentItem }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <Field name="name" label="器材名稱" defaultValue={item?.name ?? ''} required />
      <Field name="unitPrice" label="價格" type="number" min="0" defaultValue={String(item?.unit_price ?? 0)} required />
      <Field name="displayOrder" label="排序" type="number" defaultValue={String(item?.display_order ?? 0)} />
      <Field name="imageUrl" label="圖片 URL" defaultValue={item?.image_url ?? ''} className="xl:col-span-2" />
      <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
        <input name="isActive" type="checkbox" defaultChecked={item?.is_active ?? true} className="size-4 accent-brand" />
        啟用
      </label>
      <label className="md:col-span-2 xl:col-span-6">
        <span className="mb-2 block text-sm text-ink-2">描述</span>
        <textarea
          name="description"
          defaultValue={item?.description ?? ''}
          className="min-h-24 w-full resize-none rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
      </label>
    </div>
  )
}

function Field({ name, label, defaultValue = '', type = 'text', required, min, className = '' }: {
  name: string
  label: string
  defaultValue?: string
  type?: string
  required?: boolean
  min?: string
  className?: string
}) {
  return (
    <label className={className}>
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

function formToPayload(form: FormData): Omit<RawEquipmentItem, 'id'> {
  return {
    name: String(form.get('name') ?? '').trim(),
    description: String(form.get('description') ?? '').trim() || undefined,
    unit_price: Math.max(0, Math.round(Number(form.get('unitPrice') ?? 0))),
    image_url: String(form.get('imageUrl') ?? '').trim() || undefined,
    is_active: form.get('isActive') === 'on',
    display_order: Math.round(Number(form.get('displayOrder') ?? 0)),
    metadata: JSON.stringify({}) as unknown as Record<string, unknown>,
  }
}
