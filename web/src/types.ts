/** 推送场景：群聊 / 私聊 */
export type PushScene = 'group' | 'friend'

/**
 * 推送目标
 * - `peer` 在群聊下是群号，在私聊下是 QQ 号
 * - 字符串写法（`group:123456`）在读取时会被后端归一化为该结构
 */
export interface PushTarget {
  scene: PushScene
  peer: string
  /** 群名 / 备注名，仅用于展示 */
  name?: string
  /** 指定推送使用的 Bot；为空时用第一个在线 Bot */
  selfId?: string
}

/** 插件配置结构，与 src/config.js 的 defaultConfig 保持一致 */
export interface Config {
  enable: boolean
  statusUrl: string
  statusSlug: string
  /** 是否同时启用指标接口（可监控未公开到状态页的监控项） */
  metricsEnable: boolean
  /** 指标接口地址，留空自动由面板地址推导 */
  metricsUrl: string
  /** 指标接口的 API 密钥（Basic 认证密码） */
  metricsApiKey: string
  /** Basic 认证用户名，可任意填写 */
  metricsApiUser: string
  interval: number
  timeout: number
  targets: PushTarget[]
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

/** 可勾选的监控项 */
export interface MonitorOption {
  id: string
  name: string
  type: string
  status: number | null
}

export interface MonitorListPayload {
  /** metrics = 来自指标接口（含未公开项）；status-page = 只含已公开项 */
  source: 'metrics' | 'status-page'
  monitors: MonitorOption[]
}

export type DeviceLayout = 'desktop' | 'mobile'

export type MenuKey = 'config' | 'about'
