export type AdminBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type AdminPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded'

export interface AdminBooking {
  id: number
  number: string
  customer: string
  email: string
  phone: string
  studio: string
  scene: string
  date: string
  time: string
  amount: number
  bookingStatus: AdminBookingStatus
  paymentStatus: AdminPaymentStatus
  source: 'web' | 'admin' | 'phone'
  lockCode?: string
  note?: string
}

export const bookings: AdminBooking[] = [
  {
    id: 1,
    number: 'ODE-20260712-0001',
    customer: '林予安',
    email: 'yu.an@example.com',
    phone: '0912-345-678',
    studio: '北窗棚',
    scene: '窗邊角落',
    date: '07/12',
    time: '14:00-19:00',
    amount: 6000,
    bookingStatus: 'pending',
    paymentStatus: 'pending',
    source: 'web',
    note: '商品拍攝，需要長桌與延長線。',
  },
  {
    id: 2,
    number: 'ODE-20260713-0002',
    customer: '周庭',
    email: 'ting@example.com',
    phone: '0988-221-105',
    studio: '河景陽台',
    scene: '陽台植栽區',
    date: '07/13',
    time: '09:00-12:00',
    amount: 4500,
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
    source: 'web',
    lockCode: '583914',
  },
  {
    id: 3,
    number: 'ODE-20260714-0003',
    customer: 'Mori Studio',
    email: 'hello@mori.test',
    phone: '02-2511-9032',
    studio: '北窗棚',
    scene: '木長椅',
    date: '07/14',
    time: '13:00-17:00',
    amount: 4800,
    bookingStatus: 'confirmed',
    paymentStatus: 'unpaid',
    source: 'admin',
  },
  {
    id: 4,
    number: 'ODE-20260715-0004',
    customer: '陳苡柔',
    email: 'irene@example.com',
    phone: '0920-774-118',
    studio: '北窗棚',
    scene: '窗邊角落',
    date: '07/15',
    time: '10:00-15:00',
    amount: 6000,
    bookingStatus: 'completed',
    paymentStatus: 'paid',
    source: 'phone',
    lockCode: '148026',
  },
]

export const dashboardStats = [
  { label: '今日預約', value: '3', hint: '2 筆已確認', tone: 'brand' },
  { label: '明日預約', value: '5', hint: '1 筆待付款', tone: 'info' },
  { label: '待付款', value: '7', hint: '含 2 筆逾期', tone: 'warning' },
  { label: '本月營收', value: 'NT$ 148,000', hint: '完成 24 筆', tone: 'success' },
]

export const operations = [
  { time: '10:42', actor: 'Owner', action: '確認付款', target: 'ODE-20260713-0002' },
  { time: '10:10', actor: 'Staff', action: '更新電子鎖密碼', target: 'ODE-20260713-0002' },
  { time: '09:28', actor: 'System', action: '寄送預約確認信', target: 'yu.an@example.com' },
]

export const scheduleDays = [
  { day: '一', date: '07/13', state: 'maintenance', title: '上午維護', count: '2 / 6' },
  { day: '二', date: '07/14', state: 'limited', title: '下午包場', count: '4 / 8' },
  { day: '三', date: '07/15', state: 'full', title: '已滿', count: '8 / 8' },
  { day: '四', date: '07/16', state: 'available', title: '可預約', count: '1 / 8' },
  { day: '五', date: '07/17', state: 'limited', title: '晚間已訂', count: '5 / 8' },
  { day: '六', date: '07/18', state: 'closed', title: '公休', count: '0 / 0' },
  { day: '日', date: '07/19', state: 'available', title: '可預約', count: '3 / 8' },
]

export const customers = [
  { name: '林予安', email: 'yu.an@example.com', phone: '0912-345-678', bookings: 3, spent: 18400, lastVisit: '2026/07/12' },
  { name: '周庭', email: 'ting@example.com', phone: '0988-221-105', bookings: 2, spent: 10200, lastVisit: '2026/07/13' },
  { name: 'Mori Studio', email: 'hello@mori.test', phone: '02-2511-9032', bookings: 7, spent: 48600, lastVisit: '2026/07/14' },
  { name: '陳苡柔', email: 'irene@example.com', phone: '0920-774-118', bookings: 1, spent: 6000, lastVisit: '2026/07/15' },
]

export const studios = [
  {
    name: '北窗棚',
    slug: 'north-window',
    status: '上架中',
    area: '18.5 坪',
    capacity: '8 人',
    price: 1200,
    features: ['自然光', '白牆', '木地板', '化妝間'],
  },
  {
    name: '河景陽台',
    slug: 'river-terrace',
    status: '上架中',
    area: '12 坪',
    capacity: '6 人',
    price: 1500,
    features: ['半戶外', '斜射光', '植栽', '磨石地'],
  },
]

export const sceneCards = [
  { name: '窗邊角落', studio: '北窗棚', order: 1, visible: true, tags: ['自然光', '白色', '極簡'] },
  { name: '木長椅', studio: '北窗棚', order: 2, visible: true, tags: ['木質', '溫暖', '生活感'] },
  { name: '陽台植栽區', studio: '河景陽台', order: 3, visible: true, tags: ['戶外', '植栽', '斜光'] },
]

export const settingGroups = [
  {
    title: '營業時間',
    items: ['週二至週日 09:00-21:00', '週一預設公休', '最短預約 120 分鐘'],
  },
  {
    title: '付款與匯款',
    items: ['國泰世華 013', '付款期限 24 小時', '後台確認款項後成立'],
  },
  {
    title: '通知',
    items: ['預約確認信：啟用', '付款確認信：啟用', '電子鎖密碼：前一日 18:00'],
  },
]

export function formatCurrency(value: number) {
  return `NT$ ${value.toLocaleString('zh-TW')}`
}
