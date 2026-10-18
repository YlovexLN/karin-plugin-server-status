import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { karinPathBase, copyConfigSync, requireFileSync, logger } from 'node-karin'

/** 插件包绝对路径 */
const pluginDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 是否已经提示过配置解析失败 */
let warnedBrokenConfig = false

/**
 * 插件目录信息
 * - 配置/数据目录遵循 Karin 规范，统一放在 `@karinjs/<插件文件夹名>/` 下
 */
export const dir = {
  /** 插件包绝对路径 */
  pluginDir,
  /** 插件文件夹名称（即 `@karinjs` 下的目录名） */
  pluginName: path.basename(pluginDir),
  /** 插件自带的默认配置目录 */
  defConfigDir: path.join(pluginDir, 'config'),
  /** 插件在 `@karinjs` 下的根目录 */
  karinPath: path.join(karinPathBase, path.basename(pluginDir)),
  /** 用户配置目录 */
  get configDir () {
    return path.join(this.karinPath, 'config')
  },
  /** 用户配置绝对路径 */
  get configFile () {
    return path.join(this.configDir, 'config.json')
  },
  /** 数据目录（状态持久化） */
  get dataDir () {
    return path.join(this.karinPath, 'data')
  },
  /** 状态文件绝对路径 */
  get stateFile () {
    return path.join(this.dataDir, 'state.json')
  }
}

/**
 * 默认配置
 * - 仅作为兜底，实际以 `config/config.json` 为准
 */
export const defaultConfig = {
  /** 是否启用定时监控 */
  enable: true,
  /** 监控面板地址，可填面板根地址或状态页完整地址 */
  statusUrl: 'http://127.0.0.1:3001',
  /** 状态页 slug，即 /status/:slug 中的 slug */
  statusSlug: 'default',
  /** 检测间隔（秒），受 cron 限制实际最小为 60 秒 */
  interval: 60,
  /** 请求超时（毫秒） */
  timeout: 10000,
  /** 告警推送目标，留空则推送给机器人主人 */
  targets: [],
  /** targets 为空时是否推送给机器人主人 */
  fallbackToMaster: true,
  /** 启动后首次检测到异常是否也推送（默认只记录状态，避免重启刷屏） */
  notifyOnStart: false,
  /** 进入「待确认」(PENDING) 状态时是否告警 */
  alertOnPending: false,
  /** 恢复时是否推送恢复通知 */
  notifyRecovery: true,
  /** 持续异常时的重复提醒间隔（分钟），0 表示不重复提醒 */
  repeatInterval: 30,
  /** 面板本身不可达时是否告警 */
  notifySourceDown: true,
  /** 面板连续失败多少次后告警 */
  sourceDownRetries: 3,
  /** 只监控这些监控项（名称或 ID），留空表示全部 */
  onlyMonitors: [],
  /** 忽略这些监控项（名称或 ID） */
  ignoreMonitors: [],
  /** 是否附带状态截图，关闭后仅发送文本 */
  enableImage: true,
  /** 截图中最多展示的历史心跳数量 */
  maxHeartbeats: 50,
  /** 截图主题：dark / light */
  theme: 'dark',
  /** 截图宽度（px） */
  width: 1000,
  /** 截图缩放倍率，越大越清晰、文件越大 */
  deviceScaleFactor: 2,
  /** 截图内的时间时区，如 Asia/Shanghai，留空使用系统时区 */
  timezone: ''
}

/**
 * 深合并配置（数组直接覆盖）
 * @param {Record<string, any>} base 默认值
 * @param {Record<string, any>} patch 用户值
 */
const mergeConfig = (base, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  const result = { ...base }
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (value === undefined) continue
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])
    ) {
      result[key] = mergeConfig(base[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * 确保配置目录、数据目录存在，并释放默认配置文件
 */
export const ensureConfig = () => {
  try {
    copyConfigSync(dir.defConfigDir, dir.configDir, ['.json'])
  } catch { /* 忽略只读文件系统等异常 */ }

  try {
    fs.mkdirSync(dir.dataDir, { recursive: true })
  } catch { /* 忽略 */ }

  return dir.configFile
}

/**
 * 读取用户配置（与默认配置合并）
 * - 使用 force 读取，修改 config.json 后无需重启
 * @returns {typeof defaultConfig}
 */
export const getConfig = () => {
  ensureConfig()
  let user = {}
  try {
    user = requireFileSync(dir.configFile, { force: true }) || {}
  } catch (error) {
    if (!warnedBrokenConfig) {
      warnedBrokenConfig = true
      logger.warn(`[server-status] 配置文件解析失败，已使用默认配置：${error?.message || error}`)
    }
    user = {}
  }
  const cfg = mergeConfig(defaultConfig, user)
  cfg.interval = Math.max(30, Number(cfg.interval) || 60)
  cfg.timeout = Math.max(1000, Number(cfg.timeout) || 10000)
  cfg.sourceDownRetries = Math.max(1, Number(cfg.sourceDownRetries) || 3)
  cfg.maxHeartbeats = Math.min(100, Math.max(10, Number(cfg.maxHeartbeats) || 50))
  cfg.width = Math.min(1600, Math.max(600, Number(cfg.width) || 1000))
  cfg.deviceScaleFactor = Math.min(4, Math.max(1, Number(cfg.deviceScaleFactor) || 2))
  cfg.theme = cfg.theme === 'light' ? 'light' : 'dark'
  if (!Array.isArray(cfg.targets)) cfg.targets = []
  if (!Array.isArray(cfg.onlyMonitors)) cfg.onlyMonitors = []
  if (!Array.isArray(cfg.ignoreMonitors)) cfg.ignoreMonitors = []
  return cfg
}

/**
 * 写入用户配置（仅覆盖传入的字段）
 * @param {Record<string, any>} patch 需要修改的字段
 */
export const saveConfig = (patch) => {
  ensureConfig()
  let user = {}
  try {
    user = requireFileSync(dir.configFile, { force: true }) || {}
  } catch {
    user = {}
  }

  const next = mergeConfig(user, patch)
  const tmpFile = `${dir.configFile}.tmp-${process.pid}-${Date.now()}`

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf-8')
    fs.renameSync(tmpFile, dir.configFile)
  } catch (error) {
    try {
      fs.rmSync(tmpFile, { force: true })
    } catch { /* 清理失败不覆盖原始错误 */ }
    throw error
  }

  return next
}
