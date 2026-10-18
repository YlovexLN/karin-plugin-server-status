/**
 * 状态页 API 客户端测试（本地 mock 服务，不依赖真实面板）
 * 运行：node test/test-api.mjs
 */

import http from 'node:http'
import { StatusClient, buildSnapshot, parseStatusTime, resolveEndpoint } from '../src/client.js'

let passed = 0
let failed = 0

const assert = (condition, message) => {
  if (condition) passed++
  else {
    failed++
    console.error(`✗ ${message}`)
  }
}

/** 模拟面板返回的数据 */
const pageData = {
  config: { slug: 'default', title: '测试状态页', description: 'mock', published: true },
  incidents: [],
  publicGroupList: [
    {
      id: 1,
      name: '核心服务',
      monitorList: [
        { id: 1, name: 'Web', type: 'http', url: 'https://example.com', tags: [] },
        { id: 2, name: 'DB', type: 'tcp', tags: [] }
      ]
    }
  ]
}

const now = Date.now()
const isoUtc = (ts) => new Date(ts).toISOString().replace('T', ' ').replace('Z', '')

const heartbeatData = {
  heartbeatList: {
    1: [
      { status: 1, time: isoUtc(now - 120000), msg: '', ping: 42 },
      { status: 0, time: isoUtc(now - 60000), msg: '', ping: null }
    ],
    2: [
      { status: 1, time: isoUtc(now - 60000), msg: '', ping: 8 }
    ]
  },
  uptimeList: { '1_24': 0.995, '2_24': 1 }
}

/** 启动 mock 服务 */
let slowTimer = null
const server = http.createServer((req, res) => {
  const url = req.url || ''
  const parts = url.split('/').filter(Boolean)
  const slug = parts[parts.length - 1]
  const isHeartbeat = parts.includes('heartbeat')

  if (slug === 'missing') {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
    return
  }

  if (slug === 'html') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html><body>login</body></html>')
    return
  }

  if (slug === 'slow') {
    slowTimer = setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(isHeartbeat ? heartbeatData : pageData))
    }, 800)
    return
  }

  if (slug === 'default') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(isHeartbeat ? heartbeatData : pageData))
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end('{}')
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

try {
  /** 1. 正常拉取 */
  const client = new StatusClient({ statusUrl: base, statusSlug: 'default', timeout: 3000 })
  const snapshot = await client.getSnapshot()

  assert(snapshot.monitors.length === 2, '应解析出 2 个监控项')
  assert(snapshot.title === '测试状态页', '标题解析')
  assert(snapshot.groups[0].name === '核心服务', '分组解析')
  assert(snapshot.monitors[0].status === 0, 'Web 最新状态应为故障')
  assert(snapshot.monitors[0].uptime24 === 0.995, '可用率解析')
  assert(snapshot.monitors[0].avgPing === 42, '平均响应只统计有效 ping')
  assert(snapshot.summary.down === 1 && snapshot.summary.up === 1, '汇总统计')
  assert(snapshot.summary.overall === 'down', '整体状态')
  assert(snapshot.monitors[0].heartbeats.length === 2, '心跳数量')
  assert(Math.abs(snapshot.monitors[1].latest.time - (now - 60000)) < 2000, '心跳时间解析')

  /** 2. 404 提示 */
  let notFound = ''
  try {
    await new StatusClient({ statusUrl: base, statusSlug: 'missing', timeout: 3000 }).getSnapshot()
  } catch (error) {
    notFound = error.message
  }
  assert(notFound.includes('404'), '404 应抛出可读错误')
  assert(notFound.includes('slug'), '404 应提示检查 slug')

  /** 3. 非 JSON 响应 */
  let badJson = ''
  try {
    await new StatusClient({ statusUrl: base, statusSlug: 'html', timeout: 3000 }).getSnapshot()
  } catch (error) {
    badJson = error.message
  }
  assert(badJson.includes('JSON'), '非 JSON 应给出提示')

  /** 4. 超时 */
  let timeoutError = ''
  try {
    await new StatusClient({ statusUrl: base, statusSlug: 'slow', timeout: 150 }).getSnapshot()
  } catch (error) {
    timeoutError = error.message
  }
  assert(timeoutError.includes('超时'), '超时应抛出可读错误')

  /** 5. 带状态页 URL 的配置 */
  const fromUrl = new StatusClient({ statusUrl: `${base}/status/default`, statusSlug: '' })
  assert(fromUrl.slug === 'default', '应从 URL 提取 slug')
  const fromUrlSnapshot = await fromUrl.getSnapshot()
  assert(fromUrlSnapshot.monitors.length === 2, '从 URL 解析后应可正常拉取')

  /** URL 中的 slug 比配置更具体，应优先使用 */
  assert(resolveEndpoint(`${base}/status/default`, 'other').slug === 'default', 'URL 中的 slug 应优先于配置')
  assert(resolveEndpoint(base, 'other').slug === 'other', '根地址应使用配置的 slug')
  assert(resolveEndpoint(base, '').slug === 'default', '缺少 slug 时应回退 default')

  /** 6. 子路径部署 */
  assert(resolveEndpoint('https://host/monitor', 'abc').base === 'https://host/monitor', '反向代理子路径')
  assert(resolveEndpoint('https://host/monitor/status/abc').base === 'https://host/monitor', '子路径 + slug')

  /** 7. 空数据容错 */
  const empty = buildSnapshot({}, {}, {})
  assert(empty.monitors.length === 0, '空数据应返回空列表')
  assert(empty.summary.overall === 'unknown', '空数据整体状态为 unknown')

  /** 8. 心跳时间解析（UTC 无时区） */
  assert(Math.abs(parseStatusTime('2026-10-18 01:40:12.123') - Date.parse('2026-10-18T01:40:12.123Z')) === 0, 'UTC 时间解析')
  assert(Number.isNaN(parseStatusTime(null)), '非法时间返回 NaN')
} finally {
  if (slowTimer) clearTimeout(slowTimer)
  server.closeAllConnections?.()
  server.close()
  await new Promise((resolve) => setTimeout(resolve, 50))
}

console.log('')
console.log(`API 测试：${passed} 通过，${failed} 失败`)
if (failed > 0) process.exit(1)
