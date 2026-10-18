/** 插件配置结构，与 src/config.js 的 defaultConfig 保持一致 */
export interface Config {
  enable: boolean
  statusUrl: string
  statusSlug: string
  interval: number
  timeout: number
  targets: string[]
  fallbackToMaster: boolean
  notifyOnStart: boolean
  alertOnPending: boolean
  notifyRecovery: boolean
  repeatInterval: number
  notifySourceDown: boolean
  sourceDownRetries: number
  onlyMonitors: string[]
  ignoreMonitors: string[]
  enableImage: boolean
  maxHeartbeats: number
  theme: 'dark' | 'light'
  width: number
  deviceScaleFactor: number
  timezone: string
}

export type ConfigKey = keyof Config

/** Karin 统一响应结构 */
export interface ApiResponse<T> {
  code: number
  data: T
  message?: string
}

export interface ConfigPayload {
  config: Config
  defaults: Config
  meta: {
    configFile: string
    version: string
  }
}

export interface MonitorState {
  status?: number
  since?: number
  lastNotifyAt?: number
  notifyCount?: number
  name?: string
}

export interface StatePayload {
  state: {
    version?: number
    monitors?: Record<string, MonitorState>
    source?: {
      failing?: number
      down?: boolean
      downSince?: number
      lastNotifyAt?: number
      lastError?: string
      everUp?: boolean
    }
  }
  updatedAt: number
}

export interface PushResult {
  total: number
  success: number
}

export type DeviceLayout = 'desktop' | 'mobile'

export type MenuKey = 'config' | 'about'
