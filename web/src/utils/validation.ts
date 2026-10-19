import type { Config } from '../types'
import { normalizeTargets, sceneLabel, validateTarget } from './targets'

export type ConfigErrors = Partial<Record<keyof Config, string>>

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** 前端配置校验，仅用于交互提示；后端会再次校验 */
export const validateConfig = (config: Config | null): ConfigErrors => {
  if (!config) return {}

  const errors: ConfigErrors = {}

  if (!config.statusUrl.trim()) {
    errors.statusUrl = '面板地址不能为空'
  } else if (!/^https?:\/\//i.test(config.statusUrl.trim())) {
    errors.statusUrl = '需要以 http:// 或 https:// 开头'
  }

  if (!isFiniteNumber(config.interval) || config.interval < 30) {
    errors.interval = '检测间隔不能小于 30 秒'
  }

  if (!isFiniteNumber(config.timeout) || config.timeout < 1000) {
    errors.timeout = '请求超时不能小于 1000 毫秒'
  }

  if (!isFiniteNumber(config.repeatInterval) || config.repeatInterval < 0) {
    errors.repeatInterval = '重复提醒间隔不能小于 0'
  }

  if (!isFiniteNumber(config.sourceDownRetries) || config.sourceDownRetries < 1) {
    errors.sourceDownRetries = '连续失败次数不能小于 1'
  }

  if (!isFiniteNumber(config.width) || config.width < 600 || config.width > 1600) {
    errors.width = '截图宽度需要在 600 - 1600 之间'
  }

  if (!isFiniteNumber(config.deviceScaleFactor) || config.deviceScaleFactor < 1 || config.deviceScaleFactor > 4) {
    errors.deviceScaleFactor = '缩放倍率需要在 1 - 4 之间'
  }

  if (!isFiniteNumber(config.maxHeartbeats) || config.maxHeartbeats < 10 || config.maxHeartbeats > 100) {
    errors.maxHeartbeats = '心跳数量需要在 10 - 100 之间'
  }

  for (const target of normalizeTargets(config.targets)) {
    const message = validateTarget(target)
    if (message) {
      errors.targets = `${sceneLabel(target.scene)} ${target.peer}：${message}`
      break
    }
  }

  return errors
}
