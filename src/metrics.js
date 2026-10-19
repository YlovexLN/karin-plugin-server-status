/**
 * 面板指标接口客户端
 *
 * 面板的 `/metrics` 端点返回 Prometheus 文本格式，覆盖**全部**监控项（含未公开到状态页的），
 * 但只提供当前状态、可用率与响应时间，没有分组、描述和心跳历史。
 *
 * 认证走 HTTP Basic：用户名可任意填写，密码填面板生成的 API 密钥。
 * 面板里存在 API 密钥时，用户名密码认证会被禁用，因此默认用户名仅作占位。
 */

import { STATUS, resolveEndpoint } from './client.js'

/** 使用到的指标名 */
const METRIC = {
  STATUS: 'monitor_status',
  UPTIME_RATIO: 'monitor_uptime_ratio',
  RESPONSE_TIME: 'monitor_response_time'
}

/** 指标接口独有的监控项在截图中归属的合成分组名 */
export const METRICS_GROUP_NAME = '指标监控'

/** 指标来源的快照标题（状态页缺失时使用） */
const METRICS_TITLE = '监控状态'

/** 状态码取值，无法识别时返回 null */
const normalizeStatus = (value) => {
  const num = Math.round(Number(value))
  if (num === STATUS.DOWN) return STATUS.DOWN
  if (num === STATUS.UP) return STATUS.UP
  if (num === STATUS.PENDING) return STATUS.PENDING
  if (num === STATUS.MAINTENANCE) return STATUS.MAINTENANCE
  return null
}

/** 解析标签值里的转义字符（反斜杠、双引号、换行） */
const unescapeLabel = (raw) => String(raw).replace(/\\(.)/g, (_, char) => {
  if (char === 'n') return '\n'
  if (char === 't') return '\t'
  return char
})

/** 匹配 `key="value"` 形式的标签 */
const LABEL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g

/**
 * 解析 Prometheus 文本格式
 * - 忽略 `#` 开头的注释与空行
 * - 每行形如 `指标名{标签="值"} 数值 [时间戳]`
 * @param {string} text 接口返回的纯文本
 * @returns {{ name: string, labels: Record<string, string>, value: number }[]}
 */
export const parsePrometheusText = (text) => {
  const samples = []

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const braceIndex = line.indexOf('{')
    let name = ''
    let labelText = ''
    let rest = ''

    if (braceIndex === -1) {
      const spaceIndex = line.search(/\s/)
      if (spaceIndex === -1) continue
      name = line.slice(0, spaceIndex)
      rest = line.slice(spaceIndex + 1)
    } else {
      const closeIndex = line.lastIndexOf('}')
      if (closeIndex < braceIndex) continue
      name = line.slice(0, braceIndex)
      labelText = line.slice(braceIndex + 1, closeIndex)
      rest = line.slice(closeIndex + 1)
    }

    name = name.trim()
    if (!name) continue

    /** 数值后面可能还有时间戳，只取第一段 */
    const value = Number(rest.trim().split(/\s+/)[0])
    if (!Number.isFinite(value)) continue

    /** @type {Record<string, string>} */
    const labels = {}
    LABEL_RE.lastIndex = 0
    let matched
    while ((matched = LABEL_RE.exec(labelText)) !== null) {
      labels[matched[1]] = unescapeLabel(matched[2])
    }

    samples.push({ name, labels, value })
  }

  return samples
}

/**
 * 重算汇总信息
 * @param {any[]} monitors 监控项
 */
const summarize = (monitors) => {
  const count = (status) => monitors.filter((monitor) => monitor.status === status).length
  const up = count(STATUS.UP)
  const down = count(STATUS.DOWN)
  const pending = count(STATUS.PENDING)
  const maintenance = count(STATUS.MAINTENANCE)

  let overall = 'unknown'
  if (monitors.length > 0) {
    if (down > 0) overall = 'down'
    else if (pending > 0) overall = 'pending'
    else if (up > 0) overall = 'up'
    else if (maintenance > 0) overall = 'maintenance'
  }

  return { total: monitors.length, up, down, pending, maintenance, overall }
}

/**
 * 把指标样本整理成与状态页一致的快照结构
 *
 * 指标接口没有心跳历史，`heartbeats` / `allHeartbeats` 恒为空数组，
 * 截图里只会画出空槽位；`latest` 仅供「最近响应」展示，`time` 记 0。
 * @param {ReturnType<typeof parsePrometheusText>} samples 解析后的样本
 * @param {{ fetchedAt?: number }} [options]
 */
export const buildMetricsSnapshot = (samples, options = {}) => {
  /** @type {Map<string, any>} */
  const byId = new Map()

  const ensure = (id) => {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: '',
        type: '',
        url: '',
        tags: [],
        group: METRICS_GROUP_NAME,
        heartbeats: [],
        allHeartbeats: [],
        latest: null,
        status: null,
        uptime24: null,
        avgPing: null,
        /** 指标接口给不出平均响应，只有当前响应时间 */
        ping: null
      })
    }
    return byId.get(id)
  }

  for (const sample of samples) {
    const id = String(sample.labels.monitor_id ?? '').trim()
    if (!id) continue

    const monitor = ensure(id)
    if (!monitor.name && sample.labels.monitor_name) monitor.name = sample.labels.monitor_name
    if (!monitor.type && sample.labels.monitor_type) monitor.type = sample.labels.monitor_type
    if (!monitor.url && sample.labels.monitor_url) monitor.url = sample.labels.monitor_url

    if (sample.name === METRIC.STATUS) {
      monitor.status = normalizeStatus(sample.value)
      continue
    }

    if (sample.name === METRIC.UPTIME_RATIO) {
      /** 上游按 window 标签分别导出 24h / 30d / 1y，这里只取 24 小时 */
      const window = String(sample.labels.window || '').trim().toLowerCase()
      if (window === '24h' || window === '24') monitor.uptime24 = sample.value
      continue
    }

    if (sample.name === METRIC.RESPONSE_TIME) {
      monitor.ping = Math.round(sample.value)
    }
  }

  const monitors = [...byId.values()].map((monitor) => {
    const { ping, ...rest } = monitor
    return {
      ...rest,
      name: monitor.name || `#${monitor.id}`,
      /**
       * 指标接口没有心跳时间，`time` 留 null：
       * `formatTime()` 会显示 `—`，`evaluate()` 的 `latest?.time || now` 会回退到当前时间。
       */
      latest: monitor.status === null && ping === null
        ? null
        : { status: monitor.status, time: null, ping }
    }
  })

  return {
    fetchedAt: Number(options.fetchedAt) || Date.now(),
    title: METRICS_TITLE,
    description: '',
    slug: '',
    groups: monitors.length > 0
      ? [{ id: METRICS_GROUP_NAME, name: METRICS_GROUP_NAME, monitors }]
      : [],
    monitors,
    summary: summarize(monitors)
  }
}

/**
 * 合并状态页快照与指标快照
 *
 * - 同一监控项按 ID 去重，**状态页那份优先**（带分组、描述与心跳条），
 *   只用指标数据补齐状态页缺失的状态 / 可用率 / 响应时间；
 * - 指标接口独有的监控项作为一个合成分组追加到末尾。
 * @param {any} statusSnapshot 状态页快照
 * @param {any} metricsSnapshot 指标快照
 */
export const mergeSnapshots = (statusSnapshot, metricsSnapshot) => {
  const statusMonitors = Array.isArray(statusSnapshot?.monitors) ? statusSnapshot.monitors : []
  const metricsMonitors = Array.isArray(metricsSnapshot?.monitors) ? metricsSnapshot.monitors : []

  if (metricsMonitors.length === 0) return statusSnapshot
  if (statusMonitors.length === 0) return metricsSnapshot

  /** @type {Map<string, any>} */
  const metricsById = new Map(metricsMonitors.map((monitor) => [String(monitor.id), monitor]))

  const groups = statusSnapshot.groups.map((group) => ({
    ...group,
    monitors: group.monitors.map((monitor) => {
      const extra = metricsById.get(String(monitor.id))
      if (!extra) return monitor

      return {
        ...monitor,
        status: monitor.status === null ? extra.status : monitor.status,
        uptime24: monitor.uptime24 === null ? extra.uptime24 : monitor.uptime24,
        latest: monitor.latest || extra.latest
      }
    })
  }))

  const seen = new Set(statusMonitors.map((monitor) => String(monitor.id)))
  const extras = metricsMonitors.filter((monitor) => !seen.has(String(monitor.id)))

  if (extras.length > 0) {
    groups.push({ id: METRICS_GROUP_NAME, name: METRICS_GROUP_NAME, monitors: extras })
  }

  const monitors = groups.flatMap((group) => group.monitors)

  return {
    ...statusSnapshot,
    groups,
    monitors,
    summary: summarize(monitors)
  }
}

/**
 * 规范化指标接口地址
 * - 未填时由面板地址推导：`<面板根地址>/metrics`
 * - 填了根地址会自动补 `/metrics`
 * @param {{ metricsUrl?: string, statusUrl?: string, statusSlug?: string }} options 配置
 * @returns {string} 完整的指标接口地址
 */
export const resolveMetricsUrl = (options) => {
  const raw = String(options?.metricsUrl || '').trim()

  if (raw) {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
    let parsed
    try {
      parsed = new URL(withProtocol)
    } catch {
      throw new Error(`指标接口地址无效：${raw}`)
    }
    const pathname = parsed.pathname.replace(/\/+$/, '')
    /** 已经是完整路径就原样使用，只填了根地址则补 /metrics */
    if (/\/metrics$/i.test(pathname)) return `${parsed.origin}${pathname}${parsed.search}`
    return `${parsed.origin}${pathname}/metrics`
  }

  /** 复用状态页地址的解析规则，拿到去掉状态页路径的面板根地址 */
  if (!String(options?.statusUrl || '').trim()) {
    throw new Error('未配置指标接口地址，且无法从面板地址推导')
  }
  const { base } = resolveEndpoint(options.statusUrl, options?.statusSlug)
  if (!base) throw new Error('未配置指标接口地址，且无法从面板地址推导')
  return `${base}/metrics`
}

/**
 * 请求纯文本并处理超时
 * @param {string} url 请求地址
 * @param {number} timeout 超时时间（毫秒）
 * @param {Record<string, string>} [headers] 额外请求头
 */
const fetchText = async (url, timeout, headers = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/plain, */*',
        'user-agent': 'karin-plugin-server-status/0.0.1',
        ...headers
      }
    })

    const text = await response.text()

    if (!response.ok) {
      const hint = response.status === 401 ? '（请确认 API 密钥是否正确）' : ''
      throw new Error(`HTTP ${response.status} ${response.statusText}${hint}`)
    }

    return text
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || error?.cause?.name === 'AbortError') {
      throw new Error(`请求超时（${timeout}ms）`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 指标接口客户端
 */
export class MetricsClient {
  /**
   * @param {{ metricsEnabled?: boolean, metricsUrl?: string, metricsApiKey?: string, metricsApiUser?: string, statusUrl?: string, statusSlug?: string, timeout?: number }} options 配置
   */
  constructor (options) {
    this.url = resolveMetricsUrl(options)
    this.apiKey = String(options.metricsApiKey || '').trim()
    this.user = String(options.metricsApiUser || '').trim() || 'server-status'
    this.timeout = Number(options.timeout) || 10000
  }

  /** Basic 认证头；密码是 API 密钥，用户名只作占位 */
  get authHeader () {
    if (!this.apiKey) return null
    return `Basic ${Buffer.from(`${this.user}:${this.apiKey}`, 'utf-8').toString('base64')}`
  }

  /** 指标接口地址 */
  get metricsUrl () {
    return this.url
  }

  /**
   * 拉取并解析指标
   * @returns {Promise<ReturnType<typeof buildMetricsSnapshot>>}
   */
  async getSnapshot () {
    if (!this.apiKey) throw new Error('未配置指标接口的 API 密钥')

    const headers = {}
    const auth = this.authHeader
    if (auth) headers.authorization = auth

    const text = await fetchText(this.url, this.timeout, headers)
    return buildMetricsSnapshot(parsePrometheusText(text), { fetchedAt: Date.now() })
  }

  /**
   * 只列出监控项，供 WebUI 勾选使用
   * @returns {Promise<{ id: string, name: string, type: string, status: number|null }[]>}
   */
  async listMonitors () {
    const snapshot = await this.getSnapshot()
    return snapshot.monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type || '',
      status: monitor.status
    }))
  }
}
