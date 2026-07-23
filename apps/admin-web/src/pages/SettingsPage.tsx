import { AtSign, Building2, Clock, CreditCard, Save, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { writeActivityLog } from '../activity'
import { useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

interface RawSetting {
  id: number
  setting_key: string
  setting_value: unknown
}

interface RawBusinessHour {
  id: number
  studio_id: number
  weekday: number
  start_minute: number
  end_minute: number
  is_closed: boolean
  note?: string | null
}

interface RawBankAccount {
  id: number
  account_name?: string
  bank_name: string
  bank_code: string
  branch_name?: string | null
  branch_code?: string | null
  account_number: string
  account_holder: string
  display_name?: string | null
  is_active?: boolean
  is_default?: boolean
  note?: string | null
}

export function SettingsPage() {
  const qc = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const { data: studioPage } = useAdminStudios()
  const activeStudioId = studioPage?.items[0]?.id
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: async () => {
      const res = await api.get<{ data: RawSetting[] }>('/public/system_settings', { pageSize: 200 })
      return Object.fromEntries(res.data.map((item) => [item.setting_key, settingValue(item.setting_value)]))
    },
  })
  const settings = settingsQuery.data ?? {}
  const businessHoursQuery = useQuery({
    queryKey: ['admin', 'business-hours', activeStudioId],
    enabled: !!activeStudioId,
    queryFn: async () => {
      const res = await api.get<{ data: RawBusinessHour[] }>('/public/business_hours', {
        pageSize: 100,
        filter: `studio_id,eq,${activeStudioId}`,
        sort: 'weekday',
      })
      return res.data
    },
  })
  const bankAccountsQuery = useQuery({
    queryKey: ['admin', 'bank-accounts'],
    queryFn: async () => {
      const res = await api.get<{ data: RawBankAccount[] }>('/public/bank_accounts', {
        pageSize: 50,
        sort: 'display_order',
      })
      return res.data
    },
  })
  const bankAccount = bankAccountsQuery.data?.find((item) => item.is_default) ?? bankAccountsQuery.data?.[0]
  const saveSettings = useMutation({
    mutationFn: async (input: {
      settings: Record<string, unknown>
      businessHours: Array<Omit<RawBusinessHour, 'id'> & { id?: number }>
      bankAccount: Omit<RawBankAccount, 'id'> & { id?: number }
    }) => {
      for (const [key, value] of Object.entries(input.settings)) {
        const existing = await api.get<{ data: RawSetting[] }>('/public/system_settings', {
          pageSize: 1,
          filter: `setting_key,eq,${key}`,
        })
        const payload = {
          setting_key: key,
          setting_value: JSON.stringify(value),
          value_type: typeof value === 'number' ? 'number' : 'string',
          category: key.split('.')[0],
          display_name: key,
          is_public: false,
          is_encrypted: false,
          validation_rules: '{}',
        }
        const found = existing.data[0]
        if (found) await api.patch(`/public/system_settings/${found.id}`, payload)
        else await api.post('/public/system_settings', payload)
      }

      for (const businessHour of input.businessHours) {
        const payload = {
          studio_id: businessHour.studio_id,
          weekday: businessHour.weekday,
          start_minute: businessHour.start_minute,
          end_minute: businessHour.end_minute,
          is_closed: businessHour.is_closed,
          note: businessHour.note,
          metadata: '{}',
        }
        if (businessHour.id) await api.patch(`/public/business_hours/${businessHour.id}`, payload)
        else await api.post('/public/business_hours', payload)
      }

      const bankPayload = {
        account_name: input.bankAccount.account_name,
        bank_name: input.bankAccount.bank_name,
        bank_code: input.bankAccount.bank_code,
        branch_name: input.bankAccount.branch_name,
        branch_code: input.bankAccount.branch_code,
        account_number: input.bankAccount.account_number,
        account_holder: input.bankAccount.account_holder,
        display_name: input.bankAccount.display_name,
        display_order: 0,
        is_active: input.bankAccount.is_active,
        is_default: input.bankAccount.is_default,
        note: input.bankAccount.note,
        metadata: '{}',
      }
      if (input.bankAccount.id) await api.patch(`/public/bank_accounts/${input.bankAccount.id}`, bankPayload)
      else await api.post('/public/bank_accounts', bankPayload)

      await writeActivityLog(api, {
        action: 'update_settings',
        entityType: 'system_settings',
        changes: input.settings,
      })
    },
    onSuccess: () => {
      setMessage('設定已儲存')
      qc.invalidateQueries({ queryKey: ['admin', 'system-settings'] })
      qc.invalidateQueries({ queryKey: ['admin', 'business-hours'] })
      qc.invalidateQueries({ queryKey: ['admin', 'bank-accounts'] })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '設定儲存失敗'),
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!activeStudioId) {
      setMessage('尚無攝影棚，無法儲存營業時間')
      return
    }
    const existingHours = new Map<number, RawBusinessHour>()
    for (const item of businessHoursQuery.data ?? []) {
      const current = existingHours.get(item.weekday)
      if (!current || item.start_minute === 0) existingHours.set(item.weekday, item)
    }
    saveSettings.mutate({
      settings: {
        'branding.site_name': String(form.get('siteName') ?? ''),
        'booking.advance_booking_days': Number(form.get('advanceBookingDays') ?? 90),
        'payment.bank_code': String(form.get('bankCode') ?? ''),
        'payment.deadline_hours': Number(form.get('paymentDeadlineHours') ?? 24),
        'payment.deposit_ratio': Number(form.get('depositRatio') ?? 0.3),
        'email.from_email': String(form.get('fromEmail') ?? ''),
        'email.booking_confirmation_enabled': form.get('bookingConfirmationEnabled') === 'on',
        'email.payment_confirmation_enabled': form.get('paymentConfirmationEnabled') === 'on',
        'lock.send_offset_hours': Number(form.get('lockSendOffsetHours') ?? 24),
        'admin.roles_note': String(form.get('rolesNote') ?? ''),
        'admin.note': String(form.get('adminNote') ?? ''),
      },
      businessHours: weekdays.map((weekday) => {
        const current = existingHours.get(weekday.value)
        return {
          id: current?.id,
          studio_id: Number(activeStudioId),
          weekday: weekday.value,
          start_minute: timeToMinute(String(form.get(`businessStart-${weekday.value}`) || '00:00')),
          end_minute: timeToMinute(String(form.get(`businessEnd-${weekday.value}`) || '24:00')),
          is_closed: form.get(`businessClosed-${weekday.value}`) === 'on',
          note: String(form.get(`businessNote-${weekday.value}`) ?? '').trim() || undefined,
        }
      }),
      bankAccount: {
        id: bankAccount?.id,
        account_name: String(form.get('bankAccountName') ?? '').trim(),
        bank_name: String(form.get('bankName') ?? '').trim(),
        bank_code: String(form.get('bankCode') ?? '').trim(),
        branch_name: String(form.get('branchName') ?? '').trim() || undefined,
        branch_code: String(form.get('branchCode') ?? '').trim() || undefined,
        account_number: String(form.get('accountNumber') ?? '').trim(),
        account_holder: String(form.get('accountHolder') ?? '').trim(),
        display_name: String(form.get('bankDisplayName') ?? '').trim(),
        is_active: form.get('bankIsActive') === 'on',
        is_default: true,
        note: String(form.get('bankNote') ?? '').trim() || undefined,
      },
    })
  }

  return (
    <form key={settingsQuery.data ? 'loaded' : 'loading'} onSubmit={onSubmit} className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Settings</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">系統設定</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理營業時間、匯款帳號、Email 通知、後台角色與系統狀態。</p>
        </div>
        <button type="submit" disabled={saveSettings.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
          <Save className="size-4" />
          {saveSettings.isPending ? '儲存中...' : '儲存變更'}
        </button>
      </div>
      {message && <p className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info-subtle-ink">{message}</p>}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-4">
          <article className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">營業時間</h2>
            <div className="mt-4 space-y-3">
              {weekdays.map((weekday) => {
                const hour = businessHoursQuery.data?.find((item) => item.weekday === weekday.value)
                return (
                  <div key={weekday.value} className="grid gap-3 rounded-lg bg-sunken p-3 md:grid-cols-[48px_1fr_1fr_72px] md:items-end">
                    <span className="pb-2 text-sm font-medium text-ink">{weekday.label}</span>
                    <SimpleField name={`businessStart-${weekday.value}`} label="開始" type="time" value={minuteToTime(hour?.start_minute ?? 0)} />
                    <SimpleField name={`businessEnd-${weekday.value}`} label="結束" value={minuteToTime(hour?.end_minute ?? 1440)} />
                    <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
                      <input name={`businessClosed-${weekday.value}`} type="checkbox" defaultChecked={hour?.is_closed ?? false} className="size-4 accent-brand" />
                      公休
                    </label>
                    <div className="md:col-span-4">
                      <SimpleField name={`businessNote-${weekday.value}`} label="備註" value={hour?.note ?? ''} />
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">付款與匯款</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SimpleField name="bankAccountName" label="帳戶名稱" value={bankAccount?.account_name ?? '主要收款帳戶'} />
              <SimpleField name="bankDisplayName" label="顯示名稱" value={bankAccount?.display_name ?? '匯款帳號'} />
              <SimpleField name="bankName" label="銀行名稱" value={bankAccount?.bank_name ?? ''} />
              <SimpleField name="bankCode" label="銀行代碼" value={bankAccount?.bank_code ?? settings['payment.bank_code'] ?? ''} />
              <SimpleField name="branchName" label="分行名稱" value={bankAccount?.branch_name ?? ''} />
              <SimpleField name="branchCode" label="分行代碼" value={bankAccount?.branch_code ?? ''} />
              <SimpleField name="accountNumber" label="帳號" value={bankAccount?.account_number ?? ''} />
              <SimpleField name="accountHolder" label="戶名" value={bankAccount?.account_holder ?? ''} />
              <SimpleField name="paymentDeadlineHours" label="付款期限" type="number" value={settings['payment.deadline_hours'] ?? '24'} suffix="小時" />
              <SimpleField name="depositRatio" label="訂金比例" type="number" step="0.01" value={settings['payment.deposit_ratio'] ?? '0.3'} />
              <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
                <input name="bankIsActive" type="checkbox" defaultChecked={bankAccount?.is_active ?? true} className="size-4 accent-brand" />
                啟用匯款帳號
              </label>
              <div className="md:col-span-2">
                <SimpleField name="bankNote" label="匯款備註" value={bankAccount?.note ?? ''} />
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
            <h2 className="font-serif text-xl text-ink">通知</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
                <input name="bookingConfirmationEnabled" type="checkbox" defaultChecked={settings['email.booking_confirmation_enabled'] !== 'false'} className="size-4 accent-brand" />
                預約確認信
              </label>
              <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
                <input name="paymentConfirmationEnabled" type="checkbox" defaultChecked={settings['email.payment_confirmation_enabled'] !== 'false'} className="size-4 accent-brand" />
                付款確認信
              </label>
              <SimpleField name="lockSendOffsetHours" label="電子鎖提前寄送" type="number" value={settings['lock.send_offset_hours'] ?? '24'} suffix="小時" />
            </div>
          </article>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <h2 className="font-serif text-xl text-ink">設定表單</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field name="siteName" icon={Building2} label="品牌名稱" value={settings['branding.site_name'] ?? '河日 Ode Studio'} />
            <Field name="advanceBookingDays" icon={Clock} label="預約開放天數" value={settings['booking.advance_booking_days'] ?? '90'} suffix="天" />
            <Field name="bankCode" icon={CreditCard} label="匯款銀行代碼" value={settings['payment.bank_code'] ?? '013'} />
            <Field name="fromEmail" icon={AtSign} label="通知寄件信箱" value={settings['email.from_email'] ?? 'notice@ode.studio'} />
            <Field name="rolesNote" icon={ShieldCheck} label="後台角色" value={settings['admin.roles_note'] ?? 'owner / admin / staff'} wide />
          </div>
          <div className="mt-6 rounded-lg border border-line bg-sunken p-4">
            <h3 className="font-medium text-ink">管理員備註</h3>
            <textarea
              name="adminNote"
              className="mt-3 min-h-28 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand"
              defaultValue={settings['admin.note'] ?? '付款確認後才算預約成立。電子鎖密碼於預約日前一天寄送，若 Email 失敗需手動重新寄送。'}
            />
          </div>
        </section>
      </div>
    </form>
  )
}

function settingValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function timeToMinute(time: string): number {
  if (time === '24:00') return 1440
  const [hour = '0', minute = '0'] = time.split(':')
  return Number(hour) * 60 + Number(minute)
}

function minuteToTime(minute: number): string {
  if (minute >= 1440) return '24:00'
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function SimpleField({
  name,
  label,
  value,
  type = 'text',
  step,
  suffix,
}: {
  name: string
  label: string
  value: string
  type?: string
  step?: string
  suffix?: string
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-ink-2">{label}</span>
      <div className="flex h-10 items-center rounded-lg border border-line bg-surface px-3">
        <input name={name} type={type} step={step} defaultValue={value} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        {suffix ? <span className="text-sm text-ink-3">{suffix}</span> : null}
      </div>
    </label>
  )
}

const weekdays = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
]

function Field({
  name,
  icon: Icon,
  label,
  value,
  suffix,
  wide,
}: {
  name: string
  icon: typeof Save
  label: string
  value: string
  suffix?: string
  wide?: boolean
}) {
  return (
    <label className={wide ? 'md:col-span-2' : undefined}>
      <span className="mb-2 flex items-center gap-2 text-sm text-ink-2">
        <Icon className="size-4 text-ink-3" />
        {label}
      </span>
      <div className="flex h-11 items-center rounded-lg border border-line bg-sunken px-3">
        <input name={name} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" defaultValue={value} />
        {suffix ? <span className="text-sm text-ink-3">{suffix}</span> : null}
      </div>
    </label>
  )
}
