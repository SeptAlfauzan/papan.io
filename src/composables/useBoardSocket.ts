/**
 * useBoardSocket — Thin composable wrapper around sync.service.
 *
 * Initialises the singleton sync service with the Pinia store,
 * then connects/disconnects based on component lifecycle.
 */
import { onMounted, onUnmounted } from 'vue'
import { useBoardStore } from '@/stores/board.store'
import {
  initSyncService,
  connectSyncService,
  disconnectSyncService,
  status,
  statusLabel,
} from '@/services/sync.service'

export function useBoardSocket(roomId?: string) {
  const store = useBoardStore()

  onMounted(() => {
    initSyncService(store)
    connectSyncService(roomId ?? 'default')
  })

  onUnmounted(() => {
    disconnectSyncService()
  })

  return {
    status,
    statusLabel,
  }
}
