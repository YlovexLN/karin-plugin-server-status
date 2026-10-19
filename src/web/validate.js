/**
 * WebUI 配置写入校验
 *
 * 前端校验只用于交互提示，后端必须再校验一次，避免写入脏数据。
 * 这里只做类型与范围检查，真正的归一化仍由 `getConfig()` 负责。
 */

import { defaultConfig } from '../config.js'
import { normalizeTargets, validateTargetList } from '../target.js'

const NUMERIC_RULES = {
  interval: { min: 30, max: Number.MAX_SAFE_INTEGER },
  timeout: { min: 1000, max: Number.MAX_SAFE_INTEGER },
  sourceDownRetries: { min: 1, max: 100 },
  maxHeartbeats: { min: 10, max: 100 },
  width: { min: 600, max: 1600 },
  deviceScaleFactor: { min: 1, max: 4 },
  repeatInterval: { min: 0, max: 100000 }
}

const trimString = (value) => (typeof value === 'string' ? value.trim() : value)

/**
 * 校验并清洗 WebUI 提交的配置片段
 * @param {Record<string, any>} input 请求体中的配置对象
 * @returns {{ ok: boolean, patch?: Record<string, any>, errors?: string[] }}
 */
export const validateConfigPatch = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['配置必须是对象'] }
  }

  const errors = []
  const patch = {}

  for (const [key, value] of Object.entries(input)) {
    if (!(key in defaultConfig)) {
      errors.push(`未知配置项：${key}`)
      continue
    }

    const def = defaultConfig[key]

    /** targets 支持字符串与对象两种写法，统一归一化为对象后落盘 */
    if (key === 'targets') {
      const targetErrors = validateTargetList(value)
      if (targetErrors.length) {
        errors.push(...targetErrors)
        continue
      }
      patch[key] = normalizeTargets(value)
      continue
    }

    if (Array.isArray(def)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        errors.push(`${key} 必须是字符串数组`)
        continue
      }
      patch[key] = value.map((item) => item.trim()).filter(Boolean)
      continue
    }

    if (typeof def === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`${key} 必须是布尔值`)
        continue
      }
      patch[key] = value
      continue
    }

    if (typeof def === 'number') {
      const num = Number(value)
      if (!Number.isFinite(num)) {
        errors.push(`${key} 必须是数字`)
        continue
      }
      const rule = NUMERIC_RULES[key]
      if (rule && (num < rule.min || num > rule.max)) {
        errors.push(`${key} 必须在 ${rule.min} - ${rule.max} 之间`)
        continue
      }
      patch[key] = num
      continue
    }

    if (typeof value !== 'string') {
      errors.push(`${key} 必须是字符串`)
      continue
    }
    patch[key] = trimString(value)
  }

  if (patch.theme !== undefined && !['dark', 'light'].includes(patch.theme)) {
    errors.push('theme 只能是 dark 或 light')
  }

  if (patch.statusUrl !== undefined && !patch.statusUrl) {
    errors.push('statusUrl 不能为空')
  }

  return errors.length ? { ok: false, errors } : { ok: true, patch }
}
