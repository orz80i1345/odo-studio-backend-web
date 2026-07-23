/**
 * endpoints/auth.ts
 * 後台管理員登入 / 取得當前使用者。
 */
import type { ApiClient } from '../client'
import type { AdminUser, AuthSession } from '../../types'
import { unwrapItem, type ScaffoldItemResponse } from './scaffold'

interface LoginResponse {
  access_token: string
  refresh_token?: string
}

interface MeResponse {
  id: number
  account?: string
  email?: string
  provider?: string
  is_active?: boolean
}

/** 管理員登入 */
export async function login(api: ApiClient, input: { email: string; password: string }) {
  const auth = unwrapItem(await api.post<ScaffoldItemResponse<LoginResponse>>('/auth/login', {
    account: input.email,
    password: input.password,
  }))

  return {
    token: auth.access_token,
    user: {
      id: 0,
      email: input.email,
      displayName: input.email,
      role: 'admin',
    },
  } satisfies AuthSession
}

/** 取得目前登入的管理員 */
export async function getMe(api: ApiClient) {
  const me = unwrapItem(await api.get<ScaffoldItemResponse<MeResponse>>('/users/me'))
  const email = me.email ?? me.account ?? ''
  return {
    id: me.id,
    email,
    displayName: email || '管理者',
    role: 'admin',
  } satisfies AdminUser
}
