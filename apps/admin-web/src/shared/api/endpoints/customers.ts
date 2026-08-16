import type { ApiClient } from '../client'
import type { CustomerAccount, Paginated } from '../../types'
import { filter, toCustomer, toScaffoldList, type RawCustomerAccount, type ScaffoldListResponse } from './scaffold'

export async function listCustomers(api: ApiClient, params?: { page?: number; pageSize?: number }) {
  const res = await api.get<ScaffoldListResponse<RawCustomerAccount>>('/public/customer_accounts', {
    page: params?.page,
    pageSize: params?.pageSize ?? 100,
    filter: filter('is_active', 'eq', true),
    sort: '-created_at',
  })
  return toScaffoldList(res, toCustomer) satisfies Paginated<CustomerAccount>
}
