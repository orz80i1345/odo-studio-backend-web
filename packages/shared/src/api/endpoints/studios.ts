/**
 * endpoints/studios.ts
 * 攝影棚讀取（前後台共用；後端依角色決定回傳範圍）。
 */
import type { ApiClient } from '../client'
import type { ID, Paginated, Studio, StudioImage } from '../../types'
import {
  filter,
  toScaffoldList,
  toStudio,
  toStudioImage,
  unwrapItem,
  unwrapList,
  type RawStudio,
  type RawStudioImage,
  type ScaffoldItemResponse,
  type ScaffoldListResponse,
} from './scaffold'

export interface CreateStudioInput {
  slug: string
  name: string
  defaultHourlyPrice: number
  description?: string
  address?: string
  floor?: string
  areaPing?: number
  capacity?: number
  features?: string[]
  minBookingMinutes?: number
  maxBookingMinutes?: number
  bookingIncrementMinutes?: number
  advanceBookingDays?: number
  cancellationHours?: number
  displayOrder?: number
  isActive?: boolean
}

export interface StudioImageInput {
  studioId: ID
  url: string
  altText?: string
  caption?: string
  displayOrder?: number
  isCover?: boolean
}

export async function listStudios(api: ApiClient, params?: { page?: number; pageSize?: number }) {
  const res = await api.get<ScaffoldListResponse<RawStudio>>('/public/studios', {
    page: params?.page,
    pageSize: params?.pageSize ?? 50,
    filter: filter('is_active', 'eq', true),
    sort: 'display_order',
  })
  const page = unwrapList(res)
  const images = await listStudioImages(api, page.items.map((studio) => studio.id))
  return {
    ...page,
    items: page.items.map((studio) => toStudio(studio, images.filter((img) => img.studioId === studio.id))),
  } satisfies Paginated<Studio>
}

export async function getStudio(api: ApiClient, studioIdOrSlug: ID | string) {
  const numericId = typeof studioIdOrSlug === 'number' || /^\d+$/.test(String(studioIdOrSlug))
  const raw = numericId
    ? unwrapItem(await api.get<ScaffoldItemResponse<RawStudio>>(`/public/studios/${studioIdOrSlug}`))
    : unwrapList(await api.get<ScaffoldListResponse<RawStudio>>('/public/studios', {
        pageSize: 1,
        filter: [filter('slug', 'eq', studioIdOrSlug), filter('is_active', 'eq', true)],
      })).items[0]

  if (!raw) return undefined as unknown as Studio
  const images = await listStudioImages(api, [raw.id])
  return toStudio(raw, images)
}

export async function createStudio(api: ApiClient, input: CreateStudioInput) {
  const res = await api.post<ScaffoldItemResponse<RawStudio>>('/public/studios', {
    slug: input.slug,
    name: input.name,
    description: input.description,
    address: input.address,
    floor: input.floor,
    area_ping: input.areaPing,
    capacity: input.capacity,
    features: input.features ?? [],
    default_hourly_price: input.defaultHourlyPrice,
    min_booking_minutes: input.minBookingMinutes ?? 120,
    max_booking_minutes: input.maxBookingMinutes ?? 480,
    booking_increment_minutes: input.bookingIncrementMinutes ?? 60,
    advance_booking_days: input.advanceBookingDays ?? 90,
    cancellation_hours: input.cancellationHours ?? 48,
    display_order: input.displayOrder ?? 0,
    is_active: input.isActive ?? true,
    metadata: '{}',
  })
  return toStudio(unwrapItem(res))
}

export async function updateStudio(api: ApiClient, studioId: ID, input: Partial<CreateStudioInput>) {
  const res = await api.patch<ScaffoldItemResponse<RawStudio>>(`/public/studios/${studioId}`, {
    slug: input.slug,
    name: input.name,
    description: input.description,
    address: input.address,
    floor: input.floor,
    area_ping: input.areaPing,
    capacity: input.capacity,
    features: input.features,
    default_hourly_price: input.defaultHourlyPrice,
    min_booking_minutes: input.minBookingMinutes,
    max_booking_minutes: input.maxBookingMinutes,
    booking_increment_minutes: input.bookingIncrementMinutes,
    advance_booking_days: input.advanceBookingDays,
    cancellation_hours: input.cancellationHours,
    display_order: input.displayOrder,
    is_active: input.isActive,
    metadata: '{}',
  })
  return toStudio(unwrapItem(res))
}

export async function createStudioImage(api: ApiClient, input: StudioImageInput) {
  const res = await api.post<ScaffoldItemResponse<RawStudioImage>>('/public/studio_images', toStudioImagePayload(input))
  return toStudioImage(unwrapItem(res))
}

export async function updateStudioImage(api: ApiClient, imageId: ID, input: Partial<StudioImageInput>) {
  const res = await api.patch<ScaffoldItemResponse<RawStudioImage>>(`/public/studio_images/${imageId}`, toStudioImagePayload(input))
  return toStudioImage(unwrapItem(res))
}

export async function deleteStudioImage(api: ApiClient, imageId: ID) {
  await api.delete(`/public/studio_images/${imageId}`)
}

export async function listStudioImages(api: ApiClient, studioIds: ID[]): Promise<StudioImage[]> {
  if (studioIds.length === 0) return []
  const res = await api.get<ScaffoldListResponse<RawStudioImage>>('/public/studio_images', {
    pageSize: 200,
    filter: filter('studio_id', 'in', studioIds.join(',')),
    sort: 'display_order',
  })
  return toScaffoldList(res, toStudioImage).items
}

function toStudioImagePayload(input: Partial<StudioImageInput>) {
  return {
    studio_id: input.studioId,
    url: input.url,
    alt_text: input.altText,
    caption: input.caption,
    display_order: input.displayOrder,
    is_cover: input.isCover,
    metadata: '{}',
  }
}
