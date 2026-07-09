import { AtSign, Building2, Clock, CreditCard, Save, ShieldCheck, ToggleLeft } from 'lucide-react'
import { settingGroups } from '../data/adminMock'

export function SettingsPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Settings</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">系統設定</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理營業時間、匯款帳號、Email 通知、後台角色與系統狀態。</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
          <Save className="size-4" />
          儲存變更
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-4">
          {settingGroups.map((group) => (
            <article key={group.title} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
              <h2 className="font-serif text-xl text-ink">{group.title}</h2>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item} className="flex items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2">
                    <span>{item}</span>
                    <ToggleLeft className="size-5 text-ink-3" />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <h2 className="font-serif text-xl text-ink">設定表單</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field icon={Building2} label="品牌名稱" value="河日 Ode Studio" />
            <Field icon={Clock} label="預約開放天數" value="90" suffix="天" />
            <Field icon={CreditCard} label="匯款銀行代碼" value="013" />
            <Field icon={AtSign} label="通知寄件信箱" value="notice@ode.studio" />
            <Field icon={ShieldCheck} label="後台角色" value="owner / admin / staff" wide />
          </div>
          <div className="mt-6 rounded-lg border border-line bg-sunken p-4">
            <h3 className="font-medium text-ink">管理員備註</h3>
            <textarea
              className="mt-3 min-h-28 w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand"
              defaultValue="付款確認後才算預約成立。電子鎖密碼於預約日前一天寄送，若 Email 失敗需手動重新寄送。"
            />
          </div>
        </section>
      </div>
    </section>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  suffix,
  wide,
}: {
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
        <input className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" defaultValue={value} />
        {suffix ? <span className="text-sm text-ink-3">{suffix}</span> : null}
      </div>
    </label>
  )
}
