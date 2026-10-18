/**
 * 本地预览脚本（不参与插件运行）
 *
 * 用模拟数据生成状态图 HTML，便于在没有 Karin 环境时检查排版。
 * 产物写到本地（不提交）的 dev/ 目录。
 * 运行：node test/preview.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSnapshot, parseStatusTime, resolveEndpoint } from '../src/client.js'
import { buildMonitorHtml, buildStatusHtml, buildTextReport } from '../src/template.js'

/** 预览产物统一放在本地目录，避免污染可提交的 test/ */
const devDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dev')
fs.mkdirSync(devDir, { recursive: true })

/** 生成状态页风格的 UTC 时间字符串 */
const isoUtc = (ts) => new Date(ts).toISOString().replace('T', ' ').replace('Z', '')

/** 生成心跳序列 */
const makeBeats = (count, statuses, pingBase = 60) => {
  const now = Date.now()
  const beats = []
  for (let i = 0; i < count; i++) {
    const status = statuses[i] ?? statuses[statuses.length - 1]
    const time = now - (count - i) * 60 * 1000
    beats.push({
      status,
      time: isoUtc(time),
      msg: '',
      ping: status === 1 ? pingBase + Math.round(Math.random() * 40) : null
    })
  }
  return beats
}

const up = 1
const down = 0
const pending = 2
const maintenance = 3

const pageData = {
  config: {
    slug: 'default',
    title: '我的服务器状态',
    description: '实时监控 · 每 60 秒检测一次 · 异常自动推送到 QQ',
    icon: '/icon.svg',
    theme: 'auto',
    published: true,
    showTags: false,
    showPoweredBy: true
  },
  incidents: [],
  publicGroupList: [
    {
      id: 1,
      name: '核心服务',
      weight: 1,
      monitorList: [
        { id: 1, name: 'Web 主站', type: 'http', url: 'https://example.com', tags: [], sendUrl: false },
        { id: 2, name: 'API 网关', type: 'http', url: 'https://api.example.com/health', tags: [], sendUrl: false },
        { id: 3, name: 'MySQL 数据库', type: 'tcp', tags: [], sendUrl: false }
      ]
    },
    {
      id: 2,
      name: '边缘节点',
      weight: 2,
      monitorList: [
        { id: 4, name: '香港节点', type: 'ping', tags: [], sendUrl: false },
        { id: 5, name: '新加坡节点', type: 'ping', tags: [], sendUrl: false },
        { id: 6, name: '夜间备份任务', type: 'push', tags: [], sendUrl: false }
      ]
    }
  ]
}

const heartbeatData = {
  heartbeatList: {
    1: makeBeats(60, [...Array(57).fill(up), down, down, down]),
    2: makeBeats(60, Array(60).fill(up), 30),
    3: makeBeats(60, [...Array(59).fill(up), pending], 12),
    4: makeBeats(60, Array(60).fill(up), 45),
    5: makeBeats(60, [...Array(42).fill(up), ...Array(18).fill(down)], 180),
    6: makeBeats(60, Array(60).fill(maintenance))
  },
  uptimeList: {
    '1_24': 0.9876,
    '2_24': 1,
    '3_24': 0.9991,
    '4_24': 0.9999,
    '5_24': 0.8123,
    '6_24': 1
  }
}

const snapshot = buildSnapshot(pageData, heartbeatData, { maxHeartbeats: 50 })

/** 基本断言，确保解析逻辑正确 */
const assert = (condition, message) => {
  if (!condition) throw new Error(`断言失败：${message}`)
}

assert(snapshot.monitors.length === 6, '监控项数量')
assert(snapshot.summary.up === 2, `正常数量，实际 ${snapshot.summary.up}`)
assert(snapshot.summary.down === 2, `异常数量，实际 ${snapshot.summary.down}`)
assert(snapshot.summary.pending === 1, '待确认数量')
assert(snapshot.summary.maintenance === 1, '维护数量')
assert(snapshot.summary.overall === 'down', '整体状态')
assert(snapshot.monitors[0].latest.status === down, 'Web 主站最新状态')
assert(snapshot.monitors[0].uptime24 === 0.9876, '可用率')
assert(snapshot.monitors[0].heartbeats.length === 50, '心跳截断')

/** 时间解析：UTC 字符串应还原为同一时刻 */
const now = Date.now()
const parsed = parseStatusTime(isoUtc(now))
assert(Math.abs(parsed - now) < 1000, `时间解析偏差 ${parsed - now}`)
assert(parseStatusTime('2026-10-18T01:40:12.123Z') === Date.parse('2026-10-18T01:40:12.123Z'), '带 Z 的时间')

/** 地址解析 */
assert(resolveEndpoint('http://127.0.0.1:3001').slug === 'default', '默认 slug')
assert(resolveEndpoint('http://127.0.0.1:3001/status/mypage').slug === 'mypage', '从 URL 提取 slug')
assert(resolveEndpoint('http://127.0.0.1:3001/status/mypage', 'default').slug === 'mypage', 'URL slug 优先于配置')
assert(resolveEndpoint('http://127.0.0.1:3001/status/mypage').base === 'http://127.0.0.1:3001', '提取 slug 后的 base')
assert(resolveEndpoint('https://monitor.example.com/monitor/status/default').base === 'https://monitor.example.com/monitor', '子路径')

const options = { theme: 'dark', width: 1000, timezone: 'Asia/Shanghai', interval: 60, maxHeartbeats: 50 }
fs.writeFileSync(path.join(devDir, 'preview-status.html'), buildStatusHtml(snapshot, options), 'utf-8')
fs.writeFileSync(path.join(devDir, 'preview-status-light.html'), buildStatusHtml(snapshot, { ...options, theme: 'light' }), 'utf-8')
fs.writeFileSync(path.join(devDir, 'preview-detail.html'), buildMonitorHtml(snapshot.monitors[4], snapshot, options), 'utf-8')
fs.writeFileSync(path.join(devDir, 'preview-text.txt'), buildTextReport(snapshot, options), 'utf-8')

/** 压力测试：12 个监控项、100 次心跳、超长名称 */
const stressMonitors = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: index === 3
    ? '非常非常长的监控项名称用于测试省略号显示效果（香港-九龙-机房-核心交换机-上联链路）'
    : `服务节点 ${index + 1}`,
  type: index % 3 === 0 ? 'http' : (index % 3 === 1 ? 'tcp' : 'ping'),
  url: index % 3 === 0 ? `https://node-${index + 1}.example.com/health/check/path` : '',
  tags: [],
  sendUrl: false
}))

const stressPage = {
  config: { slug: 'default', title: '生产环境监控看板（压力测试）', description: '' },
  publicGroupList: [{ id: 1, name: '全部节点', weight: 1, monitorList: stressMonitors }]
}

const stressBeats = {}
for (const monitor of stressMonitors) {
  stressBeats[monitor.id] = makeBeats(100, Array(100).fill(up), 20)
}

const stressSnapshot = buildSnapshot(stressPage, { heartbeatList: stressBeats, uptimeList: {} }, { maxHeartbeats: 100 })
fs.writeFileSync(path.join(devDir, 'preview-stress.html'), buildStatusHtml(stressSnapshot, { ...options, maxHeartbeats: 100 }), 'utf-8')

console.log('预览文件已生成（dev/ 为本地目录，不提交）：')
console.log(' - dev/preview-status.html')
console.log(' - dev/preview-status-light.html')
console.log(' - dev/preview-detail.html')
console.log(' - dev/preview-stress.html')
console.log(' - dev/preview-text.txt')
console.log('')
console.log(buildTextReport(snapshot, options))
