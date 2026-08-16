import { useQuery } from '@tanstack/react-query'
import { authApi, bookingsApi, customersApi, pricingApi, queryKeys, scenesApi, studiosApi } from '@studio/shared'
import { api, TOKEN_KEY } from '../lib'

export function useAdminMe() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => authApi.getMe(api),
    enabled: !!localStorage.getItem(TOKEN_KEY),
  })
}

export function useAdminBookings() {
  return useQuery({
    queryKey: queryKeys.bookings.all,
    queryFn: () => bookingsApi.listMyBookings(api, { pageSize: 100 }),
  })
}

export function useAdminStudios() {
  return useQuery({
    queryKey: queryKeys.studios.all,
    queryFn: () => studiosApi.listStudios(api, { pageSize: 100 }),
  })
}

export function useAdminScenes(studioId?: number) {
  return useQuery({
    queryKey: queryKeys.scenes.all(studioId),
    queryFn: () => scenesApi.listScenes(api, { studioId, pageSize: 200 }),
  })
}

export function useAdminCustomers() {
  return useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: () => customersApi.listCustomers(api, { pageSize: 200 }),
  })
}

export function useAdminScenePrices(sceneIds?: number[]) {
  return useQuery({
    queryKey: queryKeys.pricing.scenePrices(sceneIds),
    queryFn: () => pricingApi.listScenePrices(api, { sceneIds, activeOnly: true }),
    enabled: !!sceneIds && sceneIds.length > 0,
  })
}

export function useAdminStudioPrices(studioIds?: number[]) {
  return useQuery({
    queryKey: queryKeys.pricing.studioPrices(studioIds),
    queryFn: () => pricingApi.listStudioPrices(api, { studioIds, priceType: 'buyout', activeOnly: true }),
    enabled: !!studioIds && studioIds.length > 0,
  })
}
