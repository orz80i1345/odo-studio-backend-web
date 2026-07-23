import { Image, Plus, SlidersHorizontal, Warehouse } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ApiError, Spinner, queryKeys, scenesApi, studiosApi, type Scene, type SceneImage, type Studio, type StudioImage } from '@studio/shared'
import { writeActivityLog } from '../activity'
import { formatCurrency } from '../data/adminMock'
import { useAdminScenes, useAdminStudios } from '../hooks/useAdminData'
import { api } from '../lib'

export function StudioManagePage() {
  const qc = useQueryClient()
  const { data: studioPage, isLoading: isLoadingStudios } = useAdminStudios()
  const { data: scenePage, isLoading: isLoadingScenes } = useAdminScenes()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingStudioId, setEditingStudioId] = useState<number | null>(null)
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null)
  const [isSceneCreateOpen, setIsSceneCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [sceneMessage, setSceneMessage] = useState<string | null>(null)
  const studios = studioPage?.items ?? []
  const scenes = scenePage?.items ?? []
  const studioMap = new Map(studios.map((studio) => [studio.id, studio.name]))
  const createStudio = useMutation({
    mutationFn: (input: Parameters<typeof studiosApi.createStudio>[1]) => studiosApi.createStudio(api, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.studios.all })
      setCreateError(null)
      setIsCreateOpen(false)
    },
  })
  const updateStudio = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<Parameters<typeof studiosApi.updateStudio>[2]> }) =>
      studiosApi.updateStudio(api, id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.studios.all })
      setEditingStudioId(null)
    },
  })
  const deleteStudio = useMutation({
    mutationFn: async (studio: { id: number; name: string }) => {
      await api.delete(`/public/studios/${studio.id}`)
      await writeActivityLog(api, {
        action: 'delete_studio',
        entityType: 'studio',
        entityId: studio.id,
        changes: { name: studio.name },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.studios.all })
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
      setEditingStudioId(null)
      setCreateError(null)
    },
    onError: (error) => setCreateError(error instanceof Error ? error.message : '刪除空間失敗'),
  })
  const saveStudioImage = useMutation({
    mutationFn: async ({ studio, image, input }: { studio: Studio; image?: StudioImage; input: Parameters<typeof studiosApi.createStudioImage>[1] }) => {
      if (input.isCover) await clearStudioCover(studio, image?.id)
      if (image) return studiosApi.updateStudioImage(api, image.id, input)
      return studiosApi.createStudioImage(api, input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.studios.all })
      setCreateError(null)
    },
    onError: (error) => setCreateError(error instanceof Error ? error.message : '圖片儲存失敗'),
  })
  const deleteStudioImage = useMutation({
    mutationFn: async (imageId: number) => studiosApi.deleteStudioImage(api, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.studios.all }),
    onError: (error) => setCreateError(error instanceof Error ? error.message : '圖片刪除失敗'),
  })
  const createScene = useMutation({
    mutationFn: (input: Parameters<typeof scenesApi.createScene>[1]) => scenesApi.createScene(api, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      setIsSceneCreateOpen(false)
      setCreateError(null)
    },
  })
  const updateSceneOrder = useMutation({
    mutationFn: async (updates: Array<{ id: number; displayOrder: number }>) => {
      for (const update of updates) {
        await scenesApi.updateScene(api, update.id, { displayOrder: update.displayOrder })
      }
      await writeActivityLog(api, {
        action: 'update_scene_order',
        entityType: 'scene',
        changes: updates,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
      setSceneMessage('佈景排序已儲存')
    },
    onError: (error) => setSceneMessage(error instanceof Error ? error.message : '佈景排序儲存失敗'),
  })
  const updateScene = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof scenesApi.updateScene>[2] }) =>
      scenesApi.updateScene(api, id, input),
    onSuccess: async (scene) => {
      await writeActivityLog(api, {
        action: 'update_scene',
        entityType: 'scene',
        entityId: Number(scene.id),
        changes: { name: scene.name, displayOrder: scene.displayOrder, isActive: scene.isActive },
      })
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
      setEditingSceneId(null)
      setSceneMessage('佈景已更新')
    },
    onError: (error) => setSceneMessage(error instanceof Error ? error.message : '佈景更新失敗'),
  })
  const deleteScene = useMutation({
    mutationFn: async (scene: { id: number; name: string }) => {
      await api.delete(`/public/scenes/${scene.id}`)
      await writeActivityLog(api, {
        action: 'delete_scene',
        entityType: 'scene',
        entityId: scene.id,
        changes: { name: scene.name },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      qc.invalidateQueries({ queryKey: ['admin', 'activity-logs'] })
      setSceneMessage('佈景已刪除')
    },
    onError: (error) => setSceneMessage(error instanceof Error ? error.message : '佈景刪除失敗'),
  })
  const saveSceneImage = useMutation({
    mutationFn: async ({ scene, image, input }: { scene: Scene; image?: SceneImage; input: Parameters<typeof scenesApi.createSceneImage>[1] }) => {
      if (input.isCover) await clearSceneCover(scene, image?.id)
      if (image) return scenesApi.updateSceneImage(api, image.id, input)
      return scenesApi.createSceneImage(api, input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      setSceneMessage('佈景圖片已儲存')
    },
    onError: (error) => setSceneMessage(error instanceof Error ? error.message : '佈景圖片儲存失敗'),
  })
  const deleteSceneImage = useMutation({
    mutationFn: async (imageId: number) => scenesApi.deleteSceneImage(api, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.scenes.all() })
      setSceneMessage('佈景圖片已刪除')
    },
    onError: (error) => setSceneMessage(error instanceof Error ? error.message : '佈景圖片刪除失敗'),
  })

  async function onCreateStudio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setCreateError(null)
      await createStudio.mutateAsync({
        name: text(form, 'name'),
        slug: text(form, 'slug'),
        defaultHourlyPrice: numberValue(form, 'defaultHourlyPrice'),
        description: optionalText(form, 'description'),
        address: optionalText(form, 'address'),
        floor: optionalText(form, 'floor'),
        areaPing: optionalNumber(form, 'areaPing'),
        capacity: optionalNumber(form, 'capacity'),
        features: text(form, 'features').split(',').map((item) => item.trim()).filter(Boolean),
        minBookingMinutes: numberValue(form, 'minBookingMinutes'),
        maxBookingMinutes: numberValue(form, 'maxBookingMinutes'),
        bookingIncrementMinutes: numberValue(form, 'bookingIncrementMinutes'),
        advanceBookingDays: numberValue(form, 'advanceBookingDays'),
        cancellationHours: numberValue(form, 'cancellationHours'),
        isActive: true,
      })
      event.currentTarget.reset()
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '新增空間失敗')
    }
  }

  async function onUpdateStudio(event: FormEvent<HTMLFormElement>, studio: Studio) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setCreateError(null)
      await updateStudio.mutateAsync({
        id: studio.id,
        input: {
          name: text(form, 'name'),
          slug: text(form, 'slug'),
          defaultHourlyPrice: numberValue(form, 'defaultHourlyPrice'),
          description: optionalText(form, 'description'),
          address: optionalText(form, 'address'),
          floor: optionalText(form, 'floor'),
          areaPing: optionalNumber(form, 'areaPing'),
          capacity: optionalNumber(form, 'capacity'),
          features: text(form, 'features').split(',').map((item) => item.trim()).filter(Boolean),
          minBookingMinutes: numberValue(form, 'minBookingMinutes'),
          maxBookingMinutes: numberValue(form, 'maxBookingMinutes'),
          bookingIncrementMinutes: numberValue(form, 'bookingIncrementMinutes'),
          advanceBookingDays: numberValue(form, 'advanceBookingDays'),
          cancellationHours: numberValue(form, 'cancellationHours'),
          isActive: form.get('isActive') === 'on',
        },
      })
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '更新空間失敗')
    }
  }

  function onDeleteStudio(studio: Studio) {
    if (!window.confirm(`確定刪除攝影棚「${studio.name}」？相關佈景、營業時間與時段可能會一併刪除。`)) return
    deleteStudio.mutate({ id: Number(studio.id), name: studio.name })
  }

  async function clearStudioCover(studio: Studio, keepImageId?: number) {
    await Promise.all(studio.images
      .filter((image) => image.isCover && image.id !== keepImageId)
      .map((image) => studiosApi.updateStudioImage(api, image.id, { studioId: studio.id, isCover: false })))
  }

  async function onCreateStudioImage(event: FormEvent<HTMLFormElement>, studio: Studio) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await saveStudioImage.mutateAsync({
      studio,
      input: {
        studioId: studio.id,
        url: text(form, 'url'),
        altText: optionalText(form, 'altText'),
        caption: optionalText(form, 'caption'),
        displayOrder: optionalNumber(form, 'displayOrder') ?? studio.images.length,
        isCover: form.get('isCover') === 'on',
      },
    })
    event.currentTarget.reset()
  }

  async function onUpdateStudioImage(event: FormEvent<HTMLFormElement>, studio: Studio, image: StudioImage) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await saveStudioImage.mutateAsync({
      studio,
      image,
      input: {
        studioId: studio.id,
        url: text(form, 'url'),
        altText: optionalText(form, 'altText'),
        caption: optionalText(form, 'caption'),
        displayOrder: numberValue(form, 'displayOrder'),
        isCover: form.get('isCover') === 'on',
      },
    })
  }

  function onDeleteStudioImage(image: StudioImage) {
    if (!window.confirm('確定刪除此攝影棚圖片？')) return
    deleteStudioImage.mutate(Number(image.id))
  }

  async function onCreateScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setCreateError(null)
      await createScene.mutateAsync({
        studioId: Number(form.get('studioId')),
        name: text(form, 'name'),
        slug: text(form, 'slug'),
        description: optionalText(form, 'description'),
        tags: text(form, 'tags').split(',').map((item) => item.trim()).filter(Boolean),
        displayOrder: optionalNumber(form, 'displayOrder') ?? scenes.length,
        isActive: true,
      })
      await writeActivityLog(api, {
        action: 'create_scene',
        entityType: 'scene',
        changes: { name: text(form, 'name'), studioId: Number(form.get('studioId')) },
      })
      event.currentTarget.reset()
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '新增佈景失敗')
    }
  }

  async function onUpdateSceneOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const updates = scenes
      .map((scene) => ({
        id: Number(scene.id),
        displayOrder: Number(form.get(`sceneOrder-${scene.id}`) ?? scene.displayOrder),
      }))
      .filter((update) => scenes.find((scene) => scene.id === update.id)?.displayOrder !== update.displayOrder)
    if (updates.length === 0) {
      setSceneMessage('排序沒有變更')
      return
    }
    await updateSceneOrder.mutateAsync(updates)
  }

  async function onUpdateScene(event: FormEvent<HTMLFormElement>, sceneId: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await updateScene.mutateAsync({
      id: sceneId,
      input: {
        studioId: Number(form.get('studioId')),
        name: text(form, 'name'),
        slug: text(form, 'slug'),
        description: optionalText(form, 'description'),
        tags: text(form, 'tags').split(',').map((item) => item.trim()).filter(Boolean),
        displayOrder: numberValue(form, 'displayOrder'),
        isActive: form.get('isActive') === 'on',
      },
    })
  }

  function onDeleteScene(scene: { id: number; name: string }) {
    if (!window.confirm(`確定刪除佈景「${scene.name}」？`)) return
    deleteScene.mutate(scene)
  }

  async function clearSceneCover(scene: Scene, keepImageId?: number) {
    await Promise.all(scene.images
      .filter((image) => image.isCover && image.id !== keepImageId)
      .map((image) => scenesApi.updateSceneImage(api, image.id, { sceneId: scene.id, isCover: false })))
  }

  async function onCreateSceneImage(event: FormEvent<HTMLFormElement>, scene: Scene) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await saveSceneImage.mutateAsync({
      scene,
      input: {
        sceneId: scene.id,
        url: text(form, 'url'),
        altText: optionalText(form, 'altText'),
        caption: optionalText(form, 'caption'),
        displayOrder: optionalNumber(form, 'displayOrder') ?? scene.images.length,
        isCover: form.get('isCover') === 'on',
      },
    })
    event.currentTarget.reset()
  }

  async function onUpdateSceneImage(event: FormEvent<HTMLFormElement>, scene: Scene, image: SceneImage) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await saveSceneImage.mutateAsync({
      scene,
      image,
      input: {
        sceneId: scene.id,
        url: text(form, 'url'),
        altText: optionalText(form, 'altText'),
        caption: optionalText(form, 'caption'),
        displayOrder: numberValue(form, 'displayOrder'),
        isCover: form.get('isCover') === 'on',
      },
    })
  }

  function onDeleteSceneImage(image: SceneImage) {
    if (!window.confirm('確定刪除此佈景圖片？')) return
    deleteSceneImage.mutate(Number(image.id))
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink-3">Studios</p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">攝影棚與佈景管理</h1>
          <p className="mt-3 max-w-2xl text-ink-2">管理空間資料、封面圖片、適合拍攝類型、佈景排序與前台顯示狀態。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover"
        >
          <Plus className="size-4" />
          新增空間
        </button>
      </div>

      {isCreateOpen && (
        <form onSubmit={onCreateStudio} className="rounded-lg border border-line bg-surface p-5 shadow-quiet">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field name="name" label="空間名稱" placeholder="北窗棚" required />
            <Field name="slug" label="網址 slug" placeholder="north-window" required />
            <Field name="defaultHourlyPrice" label="基本時租" type="number" min={0} required defaultValue="1200" />
            <Field name="areaPing" label="坪數" type="number" min={0} step="0.1" defaultValue="10" />
            <Field name="capacity" label="容納人數" type="number" min={1} defaultValue="6" />
            <Field name="floor" label="樓層" placeholder="5F" />
            <Field name="minBookingMinutes" label="最短預約分鐘" type="number" min={30} defaultValue="120" />
            <Field name="bookingIncrementMinutes" label="預約單位分鐘" type="number" min={30} defaultValue="60" />
            <Field name="maxBookingMinutes" label="最長預約分鐘" type="number" min={60} defaultValue="480" />
            <Field name="advanceBookingDays" label="可提前天數" type="number" min={1} defaultValue="90" />
            <Field name="cancellationHours" label="取消期限小時" type="number" min={0} defaultValue="48" />
            <Field name="features" label="特色（逗號分隔）" placeholder="自然光, 白牆, 化妝間" />
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-ink-2">地址</span>
              <input name="address" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-ink-2">描述</span>
              <input name="description" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
            </label>
          </div>
          {createError && <p className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-ink">{createError}</p>}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={createStudio.isPending}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60"
            >
              {createStudio.isPending ? '新增中...' : '建立空間'}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="space-y-4">
          {isLoadingStudios && <div className="rounded-lg border border-line bg-surface p-10 text-center text-ink-3"><Spinner /></div>}
          {!isLoadingStudios && studios.length === 0 && (
            <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-ink-3">目前沒有攝影棚資料。</div>
          )}
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
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${studio.isActive ? 'bg-success-subtle text-success-subtle-ink' : 'bg-neutral-subtle text-neutral-subtle-ink'}`}>
                        {studio.isActive ? '上架中' : '已停用'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-3">/{studio.slug}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {studio.features.map((feature) => (
                        <span key={feature} className="rounded-full bg-neutral-subtle px-2.5 py-1 text-xs text-neutral-subtle-ink">{feature}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStudioId((id) => id === studio.id ? null : studio.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  <SlidersHorizontal className="size-4" />
                  {editingStudioId === studio.id ? '收合' : '編輯'}
                </button>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-4">
                <Info label="坪數" value={`${studio.areaPing} 坪`} />
                <Info label="容納" value={studio.capacity ? `${studio.capacity} 人` : '-'} />
                <Info label="基本時租" value={formatCurrency(studio.defaultHourlyPrice)} />
                <Info label="最短預約" value={`${studio.minBookingMinutes} 分鐘`} />
              </dl>
              {editingStudioId === studio.id && (
                <div className="mt-5 border-t border-line pt-5">
                <form onSubmit={(event) => onUpdateStudio(event, studio)}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field name="name" label="空間名稱" defaultValue={studio.name} required />
                    <Field name="slug" label="網址 slug" defaultValue={studio.slug} required />
                    <Field name="defaultHourlyPrice" label="基本時租" type="number" min={0} defaultValue={String(studio.defaultHourlyPrice)} required />
                    <Field name="areaPing" label="坪數" type="number" min={0} step="0.1" defaultValue={String(studio.areaPing)} />
                    <Field name="capacity" label="容納人數" type="number" min={1} defaultValue={String(studio.capacity ?? '')} />
                    <Field name="floor" label="樓層" defaultValue={studio.floor ?? ''} />
                    <Field name="minBookingMinutes" label="最短預約分鐘" type="number" min={30} defaultValue={String(studio.minBookingMinutes)} />
                    <Field name="bookingIncrementMinutes" label="預約單位分鐘" type="number" min={30} defaultValue={String(studio.bookingIncrementMinutes)} />
                    <Field name="maxBookingMinutes" label="最長預約分鐘" type="number" min={60} defaultValue={String(studio.maxBookingMinutes)} />
                    <Field name="advanceBookingDays" label="可提前天數" type="number" min={1} defaultValue={String(studio.advanceBookingDays)} />
                    <Field name="cancellationHours" label="取消期限小時" type="number" min={0} defaultValue={String(studio.cancellationHours)} />
                    <Field name="features" label="特色（逗號分隔）" defaultValue={studio.features.join(', ')} />
                    <label className="md:col-span-2">
                      <span className="mb-2 block text-sm text-ink-2">地址</span>
                      <input name="address" defaultValue={studio.address ?? ''} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-2 block text-sm text-ink-2">描述</span>
                      <input name="description" defaultValue={studio.description} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-2">
                      <input name="isActive" type="checkbox" defaultChecked={studio.isActive} className="accent-[color:var(--brand)]" />
                      前台顯示
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => onDeleteStudio(studio)}
                      disabled={deleteStudio.isPending}
                      className="mr-auto h-10 rounded-lg border border-danger px-4 text-sm text-danger hover:bg-danger-subtle disabled:opacity-60"
                    >
                      {deleteStudio.isPending ? '刪除中...' : '刪除空間'}
                    </button>
                    <button type="button" onClick={() => setEditingStudioId(null)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
                    <button type="submit" disabled={updateStudio.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
                      {updateStudio.isPending ? '儲存中...' : '儲存空間'}
                    </button>
                  </div>
                </form>
                <StudioImagesEditor
                  studio={studio}
                  isSaving={saveStudioImage.isPending}
                  isDeleting={deleteStudioImage.isPending}
                  onCreate={onCreateStudioImage}
                  onUpdate={onUpdateStudioImage}
                  onDelete={onDeleteStudioImage}
                />
                </div>
              )}
            </article>
          ))}
        </section>

        <aside className="rounded-lg border border-line bg-surface shadow-quiet">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-xl text-ink">佈景排序</h2>
              <p className="mt-1 text-sm text-ink-3">控制前台 gallery 呈現順序。</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSceneCreateOpen((value) => !value)}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink-2 hover:bg-sunken"
              title="新增佈景"
            >
              <Image className="size-4" />
            </button>
          </div>
          {isSceneCreateOpen && (
            <form onSubmit={onCreateScene} className="border-b border-line p-5">
              <div className="grid gap-3">
                <label>
                  <span className="mb-2 block text-sm text-ink-2">攝影棚</span>
                  <select name="studioId" required className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none">
                    <option value="">選擇攝影棚</option>
                    {studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
                  </select>
                </label>
                <Field name="name" label="佈景名稱" required />
                <Field name="slug" label="網址 slug" required />
                <Field name="tags" label="標籤（逗號分隔）" />
                <Field name="displayOrder" label="排序" type="number" min={0} defaultValue={String(scenes.length)} />
                <label>
                  <span className="mb-2 block text-sm text-ink-2">描述</span>
                  <input name="description" className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsSceneCreateOpen(false)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
                <button type="submit" disabled={createScene.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
                  {createScene.isPending ? '新增中...' : '建立佈景'}
                </button>
              </div>
            </form>
          )}
          {sceneMessage && <p className="mx-5 mt-4 rounded-md bg-info-subtle px-3 py-2 text-sm text-info-subtle-ink">{sceneMessage}</p>}
          <div className="divide-y divide-line">
            {isLoadingScenes && <div className="p-10 text-center text-ink-3"><Spinner /></div>}
            {!isLoadingScenes && scenes.length === 0 && (
              <div className="p-10 text-center text-sm text-ink-3">目前沒有佈景資料。</div>
            )}
            {scenes.map((scene) => (
              <div key={scene.name} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{scene.name}</p>
                    <p className="mt-1 text-sm text-ink-3">{studioMap.get(scene.studioId) ?? `Studio #${scene.studioId}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-ink-2">
                      排序
                      <input
                        name={`sceneOrder-${scene.id}`}
                        form="scene-order-form"
                        type="number"
                        min={0}
                        defaultValue={scene.displayOrder}
                        className="h-9 w-20 rounded-lg border border-line bg-sunken px-2 text-sm text-ink outline-none focus:border-brand"
                      />
                    </label>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${scene.isActive ? 'bg-success-subtle text-success-subtle-ink' : 'bg-neutral-subtle text-neutral-subtle-ink'}`}>
                      {scene.isActive ? '前台顯示' : '隱藏'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingSceneId((id) => id === scene.id ? null : Number(scene.id))}
                      className="h-9 rounded-lg border border-line px-3 text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                    >
                      {editingSceneId === scene.id ? '收合' : '編輯'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scene.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-sunken px-2.5 py-1 text-xs text-ink-3">{tag}</span>
                  ))}
                </div>
                {editingSceneId === scene.id && (
                  <div className="mt-4 rounded-lg border border-line bg-sunken p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label>
                        <span className="mb-2 block text-sm text-ink-2">攝影棚</span>
                        <select name="studioId" form={`scene-edit-${scene.id}`} defaultValue={scene.studioId} required className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none">
                          {studios.map((studio) => <option key={studio.id} value={studio.id}>{studio.name}</option>)}
                        </select>
                      </label>
                      <Field name="name" label="佈景名稱" defaultValue={scene.name} required form={`scene-edit-${scene.id}`} />
                      <Field name="slug" label="網址 slug" defaultValue={scene.slug} required form={`scene-edit-${scene.id}`} />
                      <Field name="displayOrder" label="排序" type="number" min={0} defaultValue={String(scene.displayOrder)} form={`scene-edit-${scene.id}`} />
                      <Field name="tags" label="標籤（逗號分隔）" defaultValue={scene.tags.join(', ')} form={`scene-edit-${scene.id}`} />
                      <label className="flex items-center gap-2 text-sm text-ink-2">
                        <input name="isActive" form={`scene-edit-${scene.id}`} type="checkbox" defaultChecked={scene.isActive} className="accent-[color:var(--brand)]" />
                        前台顯示
                      </label>
                      <label className="md:col-span-2">
                        <span className="mb-2 block text-sm text-ink-2">描述</span>
                        <input name="description" form={`scene-edit-${scene.id}`} defaultValue={scene.description ?? ''} className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand" />
                      </label>
                    </div>
                    <form id={`scene-edit-${scene.id}`} onSubmit={(event) => onUpdateScene(event, Number(scene.id))} className="mt-4 flex justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onDeleteScene({ id: Number(scene.id), name: scene.name })}
                        disabled={deleteScene.isPending}
                        className="h-10 rounded-lg border border-danger px-4 text-sm text-danger hover:bg-danger-subtle disabled:opacity-60"
                      >
                        {deleteScene.isPending ? '刪除中...' : '刪除佈景'}
                      </button>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setEditingSceneId(null)} className="h-10 rounded-lg border border-line px-4 text-sm text-ink-2 hover:bg-sunken">取消</button>
                        <button type="submit" disabled={updateScene.isPending} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
                          {updateScene.isPending ? '儲存中...' : '儲存佈景'}
                        </button>
                      </div>
                    </form>
                    <SceneImagesEditor
                      scene={scene}
                      isSaving={saveSceneImage.isPending}
                      isDeleting={deleteSceneImage.isPending}
                      onCreate={onCreateSceneImage}
                      onUpdate={onUpdateSceneImage}
                      onDelete={onDeleteSceneImage}
                    />
                  </div>
                )}
              </div>
            ))}
            {scenes.length > 0 && (
              <div className="flex justify-end p-5">
                <form id="scene-order-form" onSubmit={onUpdateSceneOrder}>
                  <button
                    type="submit"
                    disabled={updateSceneOrder.isPending}
                    className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60"
                  >
                    {updateSceneOrder.isPending ? '儲存中...' : '儲存排序'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function StudioImagesEditor({
  studio,
  isSaving,
  isDeleting,
  onCreate,
  onUpdate,
  onDelete,
}: {
  studio: Studio
  isSaving: boolean
  isDeleting: boolean
  onCreate: (event: FormEvent<HTMLFormElement>, studio: Studio) => void
  onUpdate: (event: FormEvent<HTMLFormElement>, studio: Studio, image: StudioImage) => void
  onDelete: (image: StudioImage) => void
}) {
  return (
    <section className="mt-5 rounded-lg border border-line bg-sunken p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">攝影棚圖片 URL</h3>
          <p className="mt-1 text-xs text-ink-3">前台會使用封面圖或排序第一張圖片顯示。</p>
        </div>
        <span className="text-xs text-ink-3">{studio.images.length} 張</span>
      </div>

      <div className="mt-4 space-y-3">
        {studio.images.length === 0 && <p className="rounded-lg border border-line bg-surface p-3 text-sm text-ink-3">尚未設定圖片。</p>}
        {studio.images.map((image) => (
          <ImageUrlForm
            key={image.id}
            image={image}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onSubmit={(event) => onUpdate(event, studio, image)}
            onDelete={() => onDelete(image)}
          />
        ))}
      </div>

      <form onSubmit={(event) => onCreate(event, studio)} className="mt-4 rounded-lg border border-line bg-surface p-3">
        <p className="mb-3 text-sm font-medium text-ink">新增圖片</p>
        <ImageUrlFields displayOrder={studio.images.length} />
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={isSaving} className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
            {isSaving ? '儲存中...' : '新增圖片'}
          </button>
        </div>
      </form>
    </section>
  )
}

function SceneImagesEditor({
  scene,
  isSaving,
  isDeleting,
  onCreate,
  onUpdate,
  onDelete,
}: {
  scene: Scene
  isSaving: boolean
  isDeleting: boolean
  onCreate: (event: FormEvent<HTMLFormElement>, scene: Scene) => void
  onUpdate: (event: FormEvent<HTMLFormElement>, scene: Scene, image: SceneImage) => void
  onDelete: (image: SceneImage) => void
}) {
  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">佈景圖片 URL</h3>
          <p className="mt-1 text-xs text-ink-3">前台佈景卡片與詳情頁會使用這裡的圖片。</p>
        </div>
        <span className="text-xs text-ink-3">{scene.images.length} 張</span>
      </div>

      <div className="mt-4 space-y-3">
        {scene.images.length === 0 && <p className="rounded-lg border border-line bg-sunken p-3 text-sm text-ink-3">尚未設定圖片。</p>}
        {scene.images.map((image) => (
          <ImageUrlForm
            key={image.id}
            image={image}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onSubmit={(event) => onUpdate(event, scene, image)}
            onDelete={() => onDelete(image)}
          />
        ))}
      </div>

      <form onSubmit={(event) => onCreate(event, scene)} className="mt-4 rounded-lg border border-line bg-sunken p-3">
        <p className="mb-3 text-sm font-medium text-ink">新增圖片</p>
        <ImageUrlFields displayOrder={scene.images.length} />
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={isSaving} className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
            {isSaving ? '儲存中...' : '新增圖片'}
          </button>
        </div>
      </form>
    </section>
  )
}

function ImageUrlForm({
  image,
  isSaving,
  isDeleting,
  onSubmit,
  onDelete,
}: {
  image: StudioImage | SceneImage
  isSaving: boolean
  isDeleting: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onDelete: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-3">
      <ImagePreview url={image.url} alt={image.altText} />
      <div className="mt-3">
        <ImageUrlFields image={image} displayOrder={image.displayOrder} />
      </div>
      <div className="mt-3 flex justify-between gap-3">
        <button type="button" onClick={onDelete} disabled={isDeleting} className="h-9 rounded-lg border border-danger px-3 text-sm text-danger hover:bg-danger-subtle disabled:opacity-60">
          {isDeleting ? '刪除中...' : '刪除'}
        </button>
        <button type="submit" disabled={isSaving} className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-on hover:bg-brand-hover disabled:opacity-60">
          {isSaving ? '儲存中...' : '儲存圖片'}
        </button>
      </div>
    </form>
  )
}

function ImageUrlFields({
  image,
  displayOrder,
}: {
  image?: StudioImage | SceneImage
  displayOrder: number
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_120px]">
      <label className="md:col-span-2">
        <span className="mb-2 block text-sm text-ink-2">圖片 URL</span>
        <input name="url" type="url" required defaultValue={image?.url ?? ''} placeholder="https://..." className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
      </label>
      <label>
        <span className="mb-2 block text-sm text-ink-2">替代文字</span>
        <input name="altText" defaultValue={image?.altText ?? ''} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
      </label>
      <label>
        <span className="mb-2 block text-sm text-ink-2">排序</span>
        <input name="displayOrder" type="number" min={0} defaultValue={displayOrder} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
      </label>
      <label>
        <span className="mb-2 block text-sm text-ink-2">說明</span>
        <input name="caption" defaultValue={image?.caption ?? ''} className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand" />
      </label>
      <label className="flex items-center gap-2 pt-7 text-sm text-ink-2">
        <input name="isCover" type="checkbox" defaultChecked={image?.isCover ?? false} className="accent-[color:var(--brand)]" />
        封面圖
      </label>
    </div>
  )
}

function ImagePreview({ url, alt }: { url: string; alt?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-sunken">
      <img src={url} alt={alt ?? ''} className="h-28 w-full object-cover" />
    </div>
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

function Field({
  name,
  label,
  type = 'text',
  placeholder,
  defaultValue,
  required,
  min,
  step,
  form,
}: {
  name: string
  label: string
  type?: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  min?: number
  step?: string
  form?: string
}) {
  return (
    <label>
      <span className="mb-2 block text-sm text-ink-2">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        min={min}
        step={step}
        form={form}
        className="h-10 w-full rounded-lg border border-line bg-sunken px-3 text-sm text-ink outline-none focus:border-brand"
      />
    </label>
  )
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim()
}

function optionalText(form: FormData, key: string): string | undefined {
  const value = text(form, key)
  return value || undefined
}

function numberValue(form: FormData, key: string): number {
  return Number(form.get(key) ?? 0)
}

function optionalNumber(form: FormData, key: string): number | undefined {
  const value = text(form, key)
  return value ? Number(value) : undefined
}
