/**
 * WebUI 配置 API
 *
 * 全部挂在 `/server-status/v1` 下，由 Karin 的 authMiddleware 统一鉴权。
 * 只暴露配置读写、状态读取和测试推送，不提供面板写操作。
 */

import fs from 'node:fs'
import path from 'node:path'
import express from 'node-karin/express'
import {
  createBadRequestResponse,
  createServerErrorResponse,
  createSuccessResponse
} from 'node-karin'
import { defaultConfig, dir, getConfig, saveConfig } from '../config.js'
import { StatusClient } from '../client.js'
import { MetricsClient } from '../metrics.js'
import { pushMessage } from '../notify.js'
import { validateConfigPatch } from './validate.js'

const pkg = JSON.parse(fs.readFileSync(path.join(dir.pluginDir, 'package.json'), 'utf-8'))

export const apiRouter = express.Router()

/**
 * GET /server-status/v1/config
 * 返回当前生效配置、默认值与配置文件位置
 */
export const getConfigHandler = (_req, res) => {
  try {
    const config = getConfig()
    return createSuccessResponse(res, {
      config,
      defaults: defaultConfig,
      meta: {
        configFile: dir.configFile,
        version: pkg.version
      }
    })
  } catch (error) {
    return createServerErrorResponse(res, `读取配置失败：${error?.message || error}`)
  }
}

/**
 * POST /server-status/v1/config
 * Body: { config: Partial<Config> } 或直接 Partial<Config>
 */
export const saveConfigHandler = (req, res) => {
  try {
    const body = req.body
    const patch = body && typeof body === 'object' && 'config' in body ? body.config : body
    const result = validateConfigPatch(patch)

    if (!result.ok) {
      return createBadRequestResponse(res, result.errors.join('；'))
    }

    saveConfig(result.patch)
    return createSuccessResponse(res, { config: getConfig() }, '配置已保存')
  } catch (error) {
    return createServerErrorResponse(res, `保存配置失败：${error?.message || error}`)
  }
}

/**
 * GET /server-status/v1/state
 * 返回 state.json 内容与最后更新时间，供配置页展示概览
 */
export const getStateHandler = (_req, res) => {
  try {
    const raw = fs.readFileSync(dir.stateFile, 'utf-8')
    const stat = fs.statSync(dir.stateFile)
    return createSuccessResponse(res, {
      state: JSON.parse(raw),
      updatedAt: stat.mtimeMs
    })
  } catch {
    return createSuccessResponse(res, {
      state: { monitors: {}, source: {} },
      updatedAt: 0
    })
  }
}

/**
 * POST /server-status/v1/test-push
 * 使用当前配置发送一条测试消息
 */
export const testPushHandler = async (_req, res) => {
  try {
    const cfg = getConfig()
    const result = await pushMessage(cfg, '【server-status】WebUI 测试推送', null)

    if (!result.total) {
      return createBadRequestResponse(res, '没有可用的推送目标，请先配置 targets 或机器人主人')
    }

    return createSuccessResponse(
      res,
      result,
      result.success === result.total ? '测试消息已发送' : '部分目标发送失败'
    )
  } catch (error) {
    return createServerErrorResponse(res, `测试推送失败：${error?.message || error}`)
  }
}

/**
 * POST /server-status/v1/monitors
 * 拉取可监控的监控项列表，供配置页勾选
 *
 * 请求体可携带**尚未保存**的指标接口配置，便于「先填密钥、拉列表、再保存」；
 * 缺省时回退到当前已保存的配置。优先走指标接口（覆盖全部监控项，含未公开的），
 * 没有密钥时退回状态页（只能列出公开项）。
 */
export const listMonitorsHandler = async (req, res) => {
  const cfg = getConfig()
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const pick = (key) => (typeof body[key] === 'string' && body[key].trim() ? body[key].trim() : cfg[key])

  const options = {
    metricsEnabled: true,
    metricsUrl: pick('metricsUrl'),
    metricsApiKey: pick('metricsApiKey'),
    metricsApiUser: pick('metricsApiUser'),
    statusUrl: pick('statusUrl'),
    statusSlug: pick('statusSlug'),
    timeout: cfg.timeout
  }

  if (options.metricsApiKey) {
    try {
      const monitors = await new MetricsClient(options).listMonitors()
      return createSuccessResponse(res, { source: 'metrics', monitors })
    } catch (error) {
      return createBadRequestResponse(res, `拉取监控项列表失败：${error?.message || error}`)
    }
  }

  try {
    const snapshot = await new StatusClient(options).getSnapshot()
    const monitors = snapshot.monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type || '',
      status: monitor.status
    }))
    return createSuccessResponse(res, { source: 'status-page', monitors })
  } catch (error) {
    return createBadRequestResponse(res, `拉取监控项列表失败：${error?.message || error}（也可以先填写指标接口的 API 密钥）`)
  }
}

apiRouter.get('/config', getConfigHandler)
apiRouter.post('/config', saveConfigHandler)
apiRouter.get('/state', getStateHandler)
apiRouter.post('/test-push', testPushHandler)
apiRouter.post('/monitors', listMonitorsHandler)
