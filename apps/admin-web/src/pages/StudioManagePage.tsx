import { Image, Plus, SlidersHorizontal, Warehouse } from 'lucide-react'
import { formatCurrency, sceneCards, studios } from '../data/adminMock'

export function StudioManagePage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Studios</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">攝影棚與佈景管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理空間資料、封面圖片、適合拍攝類型、佈景排序與前台顯示狀態。</p>
        </div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover">
          <Plus className="size-4" />
          新增空間
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="space-y-4">
          {studios.map((studio) => (
            <article key={studio.slug} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand-subtle-ink">
                    <Warehouse className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-2xl text-ink">{studio.name}</h2>
                      <span className="rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success-subtle-ink">{studio.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-3">/{studio.slug}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {studio.features.map((feature) => (
                        <span key={feature} className="rounded-full bg-neutral-subtle px-2.5 py-1 text-xs text-neutral-subtle-ink">{feature}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                  <SlidersHorizontal className="size-4" />
                  編輯
                </button>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-4">
                <Info label="坪數" value={studio.area} />
                <Info label="容納" value={studio.capacity} />
                <Info label="基本時租" value={formatCurrency(studio.price)} />
                <Info label="最短預約" value="120 分鐘" />
              </dl>
            </article>
          ))}
        </section>

        <aside className="rounded-lg border border-line bg-surface shadow-quiet">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-xl text-ink">佈景排序</h2>
              <p className="mt-1 text-sm text-ink-3">控制前台 gallery 呈現順序。</p>
            </div>
            <button className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken">
              <Image className="size-4" />
            </button>
          </div>
          <div className="divide-y divide-line">
            {sceneCards.map((scene) => (
              <div key={scene.name} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{scene.order}. {scene.name}</p>
                    <p className="mt-1 text-sm text-ink-3">{scene.studio}</p>
                  </div>
                  <span className="rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success-subtle-ink">
                    {scene.visible ? '前台顯示' : '隱藏'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scene.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-sunken px-2.5 py-1 text-xs text-ink-3">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sunken p-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}
