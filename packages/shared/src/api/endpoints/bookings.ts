/**
 * endpoints/bookings.ts
 * 預約單。前台會員只能看自己的預約；後台可看全部。
 */
import type { ApiClient } from '../client'
import type { Booking, BookingPaymentStatus, BookingStatus, CreateBookingInput, ID, Paginated } from '../../types'
import {
  filter,
  toBooking,
  toBookingCreate,
  toScaffoldList,
  toTimeSlot,
  unwrapItem,
  type RawBooking,
  type RawTimeSlot,
  type ScaffoldItemResponse,
  type ScaffoldListResponse,
} from './scaffold'

/** 建立預約（登入會員） */
export async function createBooking(api: ApiClient, input: CreateBookingInput) {
  const slots = await getBookingSlots(api, input)
  if (slots.length === 0 || slots.some((slot) => slot.status !== 'available')) {
    throw new Error('此時段已被預約或暫時不可預約，請重新選擇時段。')
  }
  const totals = calculateBookingTotals(slots)
  const res = await api.post<ScaffoldItemResponse<RawBooking>>('/public/bookings', toBookingCreate(input, totals))
  const booking = toBooking(unwrapItem(res))
  await syncBookingTimeSlots(api, booking)
  return booking
}

/** 我的預約列表（前台會員；後端由 token 判斷） */
export async function listMyBookings(
  api: ApiClient,
  params?: { page?: number; pageSize?: number; status?: string; customerEmail?: string },
) {
  const filters: string[] = []
  if (params?.status) filters.push(filter('status', 'eq', params.status))
  if (params?.customerEmail) filters.push(filter('customer_email', 'eq', params.customerEmail))
  const res = await api.get<ScaffoldListResponse<RawBooking>>('/public/bookings', {
    page: params?.page,
    pageSize: params?.pageSize ?? 50,
    filter: filters,
    sort: '-created_at',
  })
  return toScaffoldList(res, toBooking) satisfies Paginated<Booking>
}

/** 單一預約詳細 */
export async function getBooking(api: ApiClient, bookingId: ID) {
  const res = await api.get<ScaffoldItemResponse<RawBooking>>(`/public/bookings/${bookingId}`)
  return toBooking(unwrapItem(res))
}

/** 取消預約（前台會員） */
export async function cancelBooking(api: ApiClient, bookingId: ID, reason?: string) {
  const res = await api.patch<ScaffoldItemResponse<RawBooking>>(`/public/bookings/${bookingId}`, {
    status: 'cancelled',
    cancellation_reason: reason,
    cancelled_at: new Date().toISOString(),
  })
  const booking = toBooking(unwrapItem(res))
  await syncBookingTimeSlots(api, booking)
  return booking
}

export async function updateBooking(
  api: ApiClient,
  bookingId: ID,
  input: Partial<{
    status: BookingStatus
    paymentStatus: BookingPaymentStatus
    customerNote: string
    cancellationReason: string
  }>,
) {
  const res = await api.patch<ScaffoldItemResponse<RawBooking>>(`/public/bookings/${bookingId}`, {
    status: input.status,
    payment_status: input.paymentStatus,
    customer_note: input.customerNote,
    cancellation_reason: input.cancellationReason,
    confirmed_at: input.status === 'confirmed' ? new Date().toISOString() : undefined,
    cancelled_at: input.status === 'cancelled' ? new Date().toISOString() : undefined,
  })
  const booking = toBooking(unwrapItem(res))
  await syncBookingTimeSlots(api, booking)
  return booking
}

export async function createAdminBooking(
  api: ApiClient,
  input: CreateBookingInput & { totalPrice: number; status?: BookingStatus; paymentStatus?: BookingPaymentStatus },
) {
  const start = new Date(input.startAt)
  const end = new Date(input.endAt)
  const totalHours = Math.round(((+end - +start) / 3_600_000) * 100) / 100
  const totalPrice = Math.round(input.totalPrice)
  const res = await api.post<ScaffoldItemResponse<RawBooking>>('/public/bookings', {
    booking_number: buildBookingNumber(),
    studio_id: input.studioId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    customer_email: input.customerEmail,
    start_at: input.startAt,
    end_at: input.endAt,
    total_hours: totalHours,
    headcount: input.headcount,
    purpose: input.purpose,
    scene_ids: input.sceneIds ?? [],
    subtotal: totalPrice,
    discount_amount: 0,
    tax_amount: 0,
    total_price: totalPrice,
    deposit_amount: Math.round(totalPrice * 0.3),
    status: input.status ?? 'pending',
    payment_status: input.paymentStatus ?? 'unpaid',
    customer_note: input.customerNote,
    source: 'admin',
    metadata: {},
  })
  const booking = toBooking(unwrapItem(res))
  await syncBookingTimeSlots(api, booking)
  return booking
}

async function getBookingSlots(api: ApiClient, input: Pick<CreateBookingInput, 'studioId' | 'startAt' | 'endAt'>) {
  const start = new Date(input.startAt)
  const end = new Date(input.endAt)
  const startMinute = start.getHours() * 60 + start.getMinutes()
  const endMinute = end.getHours() * 60 + end.getMinutes()
  const slotDate = localDateFromIso(input.startAt)
  const slotsRes = await api.get<ScaffoldListResponse<RawTimeSlot>>('/public/time_slots', {
    pageSize: 200,
    filter: [
      filter('studio_id', 'eq', input.studioId),
      filter('slot_date', 'eq', toApiDateTime(slotDate)),
      filter('start_minute', 'gte', startMinute),
      filter('end_minute', 'lte', endMinute),
    ],
  })
  return toScaffoldList(slotsRes, toTimeSlot).items
}

function calculateBookingTotals(slots: ReturnType<typeof toTimeSlot>[]) {
  const subtotal = slots.length > 0
    ? slots.reduce((sum, slot) => sum + Number(slot.hourlyPrice ?? 0), 0)
    : 0
  const totalPrice = Math.round(subtotal)
  return {
    subtotal: totalPrice,
    totalPrice,
    depositAmount: Math.round(totalPrice * 0.3),
  }
}

async function syncBookingTimeSlots(api: ApiClient, booking: Booking) {
  const start = new Date(booking.startAt)
  const end = new Date(booking.endAt)
  const startMinute = start.getHours() * 60 + start.getMinutes()
  const endMinute = end.getHours() * 60 + end.getMinutes()
  const slotDate = localDateFromIso(booking.startAt)
  const slotsRes = await api.get<ScaffoldListResponse<RawTimeSlot>>('/public/time_slots', {
    pageSize: 200,
    filter: [
      filter('studio_id', 'eq', booking.studioId),
      filter('slot_date', 'eq', toApiDateTime(slotDate)),
    ],
  })
  const nextStatus = booking.status === 'cancelled' || booking.status === 'no_show' ? 'available' : 'booked'
  const slots = toScaffoldList(slotsRes, toTimeSlot).items
  await Promise.all(slots
    .filter((slot) => slot.startMinute < endMinute && slot.endMinute > startMinute)
    .map((slot) => api.patch(`/public/time_slots/${slot.id}`, {
      status: nextStatus,
      booking_id: nextStatus === 'booked' ? booking.id : null,
      metadata: '{}',
    })))
}

function localDateFromIso(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toApiDateTime(date: string): string {
  return `${date}T00:00:00Z`
}

function buildBookingNumber(): string {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `ODE-${ymd}-${String(now.getTime()).slice(-6)}`
}
