import type { ApiClient } from '@studio/shared'

export interface ActivityLogInput {
  action: string
  entityType?: string
  entityId?: number
  changes?: unknown
  status?: 'success' | 'failed'
  errorMessage?: string
}

export interface RawActivityLog {
  id: number
  action: string
  entity_type?: string
  entity_id?: number
  status: 'success' | 'failed'
  error_message?: string | null
  created_at: string
  changes?: unknown
}

export async function writeActivityLog(api: ApiClient, input: ActivityLogInput) {
  await api.post('/public/admin_activity_logs', {
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    changes: JSON.stringify(input.changes ?? {}),
    request_method: 'WEB',
    request_path: window.location.pathname,
    status: input.status ?? 'success',
    error_message: input.errorMessage,
    metadata: '{}',
    created_at: new Date().toISOString(),
  })
}
