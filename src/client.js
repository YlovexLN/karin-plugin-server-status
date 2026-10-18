/**
 * 状态页 API 客户端
 *
 * 兼容 Uptime Kuma 的公开状态页接口，只依赖原生 fetch（Node.js >= 18），不引入第三方依赖。
 * 使用到的接口（无需登录，要求状态页已发布）：
 *   GET /api/status-page/:slug           状态页配置 + 分组 + 监控项
 *   GET /api/status-page/heartbeat/:slug 最近 100 次心跳 + 24 小时可用率
 */

/** 心跳状态码 */
export const STATUS = Object.freeze({
  DOWN: 0,
  UP: 1,
  PENDING: 2,
  MAINTENANCE: 3
})

/** 状态页返回的 UTC 时间字符串（无时区标记） */
const ISO_NO_TZ = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/

/**
 * 解析状态页的时间字段
 * - 数据库里存的是 `YYYY-MM-DD HH:mm:ss.SSS` 格式的 UTC 时间（无 Z 后缀）
 * - 直接 `new Date(str)` 会被当成服务器本地时间，导致时间偏差
 * @param {string|number} time 时间
 * @returns {number} 时间戳（毫秒），无法解析时为 NaN
 */
export const parseStatusTime = (time) => {
  if (typeof time === 'number') return time
  if (typeof time !== 'string') return NaN
  const text = time.trim()
  if (!text) return NaN
  if (ISO_NO_TZ.test(text)) return Date.parse(`${text.replace(' ', 'T')}Z`)
  return Date.parse(text)
}

/**
 * 规范化监控面板地址
 * - 支持 `http://host:3001`
 * - 支持 `http://host:3001/status/default`（URL 中的 slug 优先于配置）
 * - 支持反向代理子路径 `https://host/monitor`
 * @param {string} rawUrl 用户填写的地址
 * @param {string} [slug] 配置里的 slug（仅在 URL 未包含状态页路径时使用）
 * @returns {{ base: string, slug: string }}
 */
export const resolveEndpoint = (rawUrl, slug) => {
  let url = String(rawUrl || '').trim()
  if (!url) throw new Error('未配置 statusUrl')

  if (!/^https?:\/\//i.test(url)) url = `http://${url}`

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`监控面板地址无效：${rawUrl}`)
  }

  let basePath = parsed.pathname.replace(/\/+$/, '')
  let detectedSlug = ''

  const matched = basePath.match(/\/status(?:-page)?\/([^/]+)$/i)
  if (matched) {
    detectedSlug = decodeURIComponent(matched[1])
    basePath = basePath.slice(0, matched.index)
  } else {
    basePath = basePath.replace(/\/(status|status-page)$/i, '')
  }

  return {
    base: `${parsed.origin}${basePath}`,
    /** URL 中显式写出的 slug 最具体，优先于配置；都没有时回退 default */
    slug: String(detectedSlug || slug || 'default')
  }
}

/**
 * 请求 JSON 并处理超时
 * @param {string} url 请求地址
 * @param {number} timeout 超时时间（毫秒）
 */
const fetchJson = async (url, timeout) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'karin-plugin-server-status/1.0.0'
      }
    })

    const text = await response.text()

    if (!response.ok) {
      const hint = response.status === 404 ? '（请确认状态页 slug 是否正确、状态页是否已发布）' : ''
      throw new Error(`HTTP ${response.status} ${response.statusText}${hint}`)
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new Error('返回内容不是 JSON，请确认地址指向监控面板而不是登录页')
    }
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
 * 将状态页数据与心跳数据合并为统一结构
 * @param {any} pageData `/api/status-page/:slug` 返回值
 * @param {any} heartbeatData `/api/status-page/heartbeat/:slug` 返回值
 * @param {{ maxHeartbeats?: number }} [options]
 */
export const buildSnapshot = (pageData, heartbeatData, options = {}) => {
  const maxHeartbeats = Math.max(1, Number(options.maxHeartbeats) || 50)
  const pageConfig = pageData?.config || {}
  const heartbeatList = heartbeatData?.heartbeatList || {}
  const uptimeList = heartbeatData?.uptimeList || {}

  const groups = []
  const monitors = []

  for (const group of pageData?.publicGroupList || []) {
    const list = []

    for (const raw of group?.monitorList || []) {
      const id = String(raw.id)
      const rawBeats = Array.isArray(heartbeatList[id]) ? heartbeatList[id] : []

      const beats = rawBeats
        .map((beat) => ({
          status: Number(beat?.status),
          time: parseStatusTime(beat?.time),
          ping: beat?.ping === null || beat?.ping === undefined ? null : Number(beat.ping)
        }))
        .filter((beat) => Number.isFinite(beat.time))

      const latest = beats.length ? beats[beats.length - 1] : null
      const pings = beats
        .map((beat) => beat.ping)
        .filter((ping) => typeof ping === 'number' && Number.isFinite(ping) && ping > 0)

      const uptime = Number(uptimeList[`${id}_24`])

      /** @type {any} */
      const monitor = {
        id,
        name: raw.name || `#${id}`,
        type: raw.type || 'unknown',
        url: raw.url || '',
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        group: group?.name || '',
        /** 最近若干次心跳（用于绘制状态条） */
        heartbeats: beats.slice(-maxHeartbeats),
        /** 全部心跳（最多 100 条） */
        allHeartbeats: beats,
        latest,
        status: latest ? latest.status : null,
        uptime24: Number.isFinite(uptime) ? uptime : null,
        avgPing: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null
      }

      list.push(monitor)
      monitors.push(monitor)
    }

    groups.push({
      id: group?.id,
      name: group?.name || '默认分组',
      monitors: list
    })
  }

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
    else overall = 'unknown'
  }

  return {
    fetchedAt: Date.now(),
    title: pageConfig.title || '监控状态页',
    description: pageConfig.description || '',
    slug: pageConfig.slug || '',
    groups,
    monitors,
    summary: {
      total: monitors.length,
      up,
      down,
      pending,
      maintenance,
      overall
    }
  }
}

/**
 * 状态页客户端
 */
export class StatusClient {
  /**
   * @param {{ statusUrl: string, statusSlug?: string, timeout?: number, maxHeartbeats?: number }} options
   */
  constructor (options) {
    const endpoint = resolveEndpoint(options.statusUrl, options.statusSlug)
    /** 面板根地址（可能包含反向代理子路径） */
    this.base = endpoint.base
    /** 状态页 slug */
    this.slug = endpoint.slug
    /** 请求超时 */
    this.timeout = Number(options.timeout) || 10000
    /** 截图中展示的心跳数量 */
    this.maxHeartbeats = Number(options.maxHeartbeats) || 50
  }

  /** 状态页地址 */
  get statusPageUrl () {
    return `${this.base}/status/${encodeURIComponent(this.slug)}`
  }

  /** 拉取状态页配置 */
  async getStatusPage () {
    const url = `${this.base}/api/status-page/${encodeURIComponent(this.slug)}`
    return fetchJson(url, this.timeout)
  }

  /** 拉取心跳数据 */
  async getHeartbeats () {
    const url = `${this.base}/api/status-page/heartbeat/${encodeURIComponent(this.slug)}`
    return fetchJson(url, this.timeout)
  }

  /**
   * 拉取完整快照
   * @returns {Promise<ReturnType<typeof buildSnapshot>>}
   */
  async getSnapshot () {
    const [pageData, heartbeatData] = await Promise.all([
      this.getStatusPage(),
      this.getHeartbeats()
    ])

    return buildSnapshot(pageData, heartbeatData, { maxHeartbeats: this.maxHeartbeats })
  }
}
