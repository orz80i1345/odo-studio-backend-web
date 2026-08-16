/**
 * router.tsx — admin-web 路由表
 *
 * /login          登入頁（無外框）
 * /               AdminLayout（側欄外框，之後加登入守衛）
 *   index         儀表板
 *   /bookings     預約管理
 *   /schedule     檔期日曆
 *   /studios      攝影棚管理
 *   /equipment    器材管理
 *   /customers    顧客列表
 *   /discount-codes 折扣碼管理
 *   /settings     系統設定
 * *               404
 *
 * TODO(下一輪)：AdminLayout 加上 auth guard —— 無 token 導向 /login。
 */
import { createBrowserRouter } from 'react-router'
import { AdminLayout } from '../layouts/AdminLayout'
import { LoginPage } from '../pages/LoginPage'
import { DashboardPage } from '../pages/DashboardPage'
import { BookingListPage } from '../pages/BookingListPage'
import { SchedulePage } from '../pages/SchedulePage'
import { StudioManagePage } from '../pages/StudioManagePage'
import { EquipmentPage } from '../pages/EquipmentPage'
import { CustomerListPage } from '../pages/CustomerListPage'
import { DiscountCodePage } from '../pages/DiscountCodePage'
import { SettingsPage } from '../pages/SettingsPage'
import { NotFoundPage } from '../pages/NotFoundPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'bookings', element: <BookingListPage /> },
      { path: 'schedule', element: <SchedulePage /> },
      { path: 'studios', element: <StudioManagePage /> },
      { path: 'equipment', element: <EquipmentPage /> },
      { path: 'customers', element: <CustomerListPage /> },
      { path: 'discount-codes', element: <DiscountCodePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
