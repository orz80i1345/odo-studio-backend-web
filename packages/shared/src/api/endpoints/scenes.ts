/**
 * endpoints/scenes.ts
 * 佈景列表 / 詳細。
 */
import type { ApiClient } from '../client'
import type { ID, Paginated, Scene, SceneImage } from '../../types'
import {
  filter,
  toScene,
  toSceneImage,
  unwrapItem,
  unwrapList,
  type RawScene,
  type RawSceneImage,
  type ScaffoldItemResponse,
  type ScaffoldListResponse,
} from './scaffold'

export interface CreateSceneInput {
  studioId: ID
  slug: string
  name: string
  description?: string
  tags?: string[]
  displayOrder?: number
  isActive?: boolean
}

export interface SceneImageInput {
  sceneId: ID
  url: string
  altText?: string
  caption?: string
  displayOrder?: number
  isCover?: boolean
}

export async function listScenes(api: ApiClient, params?: { studioId?: ID; page?: number; pageSize?: number }) {
  const filters = [filter('is_active', 'eq', true)]
  if (params?.studioId) filters.push(filter('studio_id', 'eq', params.studioId))

  const res = await api.get<ScaffoldListResponse<RawScene>>('/public/scenes', {
    page: params?.page,
    pageSize: params?.pageSize ?? 100,
    filter: filters,
    sort: 'display_order',
  })
  const page = unwrapList(res)
  const images = await listSceneImages(api, page.items.map((scene) => scene.id))
  return {
    ...page,
    items: page.items.map((scene) => toScene(scene, images.filter((img) => img.sceneId === scene.id))),
  } satisfies Paginated<Scene>
}

export async function getScene(api: ApiClient, sceneIdOrSlug: ID | string) {
  const numericId = typeof sceneIdOrSlug === 'number' || /^\d+$/.test(String(sceneIdOrSlug))
  const raw = numericId
    ? unwrapItem(await api.get<ScaffoldItemResponse<RawScene>>(`/public/scenes/${sceneIdOrSlug}`))
    : unwrapList(await api.get<ScaffoldListResponse<RawScene>>('/public/scenes', {
        pageSize: 1,
        filter: [filter('slug', 'eq', sceneIdOrSlug), filter('is_active', 'eq', true)],
      })).items[0]

  if (!raw) return undefined as unknown as Scene
  const images = await listSceneImages(api, [raw.id])
  return toScene(raw, images)
}

export async function createScene(api: ApiClient, input: CreateSceneInput) {
  const res = await api.post<ScaffoldItemResponse<RawScene>>('/public/scenes', {
    studio_id: input.studioId,
    slug: input.slug,
    name: input.name,
    description: input.description,
    tags: input.tags ?? [],
    display_order: input.displayOrder ?? 0,
    is_active: input.isActive ?? true,
    metadata: '{}',
  })
  return toScene(unwrapItem(res))
}

export async function updateScene(api: ApiClient, sceneId: ID, input: Partial<CreateSceneInput>) {
  const res = await api.patch<ScaffoldItemResponse<RawScene>>(`/public/scenes/${sceneId}`, {
    studio_id: input.studioId,
    slug: input.slug,
    name: input.name,
    description: input.description,
    tags: input.tags,
    display_order: input.displayOrder,
    is_active: input.isActive,
    metadata: '{}',
  })
  return toScene(unwrapItem(res))
}

export async function createSceneImage(api: ApiClient, input: SceneImageInput) {
  const res = await api.post<ScaffoldItemResponse<RawSceneImage>>('/public/scene_images', toSceneImagePayload(input))
  return toSceneImage(unwrapItem(res))
}

export async function updateSceneImage(api: ApiClient, imageId: ID, input: Partial<SceneImageInput>) {
  const res = await api.patch<ScaffoldItemResponse<RawSceneImage>>(`/public/scene_images/${imageId}`, toSceneImagePayload(input))
  return toSceneImage(unwrapItem(res))
}

export async function deleteSceneImage(api: ApiClient, imageId: ID) {
  await api.delete(`/public/scene_images/${imageId}`)
}

export async function listSceneImages(api: ApiClient, sceneIds: ID[]): Promise<SceneImage[]> {
  if (sceneIds.length === 0) return []
  const res = await api.get<ScaffoldListResponse<RawSceneImage>>('/public/scene_images', {
    pageSize: 200,
    filter: filter('scene_id', 'in', sceneIds.join(',')),
    sort: 'display_order',
  })
  return unwrapList(res).items.map(toSceneImage)
}

function toSceneImagePayload(input: Partial<SceneImageInput>) {
  return {
    scene_id: input.sceneId,
    url: input.url,
    alt_text: input.altText,
    caption: input.caption,
    display_order: input.displayOrder,
    is_cover: input.isCover,
    metadata: '{}',
  }
}
