/**
 * 仿状态页风格的 HTML 模板
 *
 * 本文件为纯函数模块，不依赖 node-karin，方便离线预览与单元测试。
 * 视觉参数（配色、字号、内边距、圆角）逐项对齐状态页的公开页面：
 * 深色底 #090c10 / 卡片 #0d1117 / 可用率胶囊 / 心跳条。
 */

import { STATUS } from './client.js'

/** 状态展示信息 */
export const STATUS_META = Object.freeze({
  [STATUS.DOWN]: { key: 'down', label: '故障', en: 'Down', color: '#dc3545', icon: 'times-circle' },
  [STATUS.UP]: { key: 'up', label: '正常', en: 'Up', color: '#5cdd8b', icon: 'check-circle' },
  [STATUS.PENDING]: { key: 'pending', label: '待确认', en: 'Pending', color: '#f8a306', icon: 'exclamation-circle' },
  [STATUS.MAINTENANCE]: { key: 'maintenance', label: '维护中', en: 'Maintenance', color: '#1747f5', icon: 'wrench' }
})

/** 整体状态展示信息 */
const OVERALL_META = Object.freeze({
  up: { label: '所有系统运行正常', en: 'All Systems Operational', color: '#5cdd8b', icon: 'check-circle' },
  down: { label: '部分服务异常', en: 'Partially Degraded Service', color: '#dc3545', icon: 'times-circle' },
  pending: { label: '部分服务待确认', en: 'Partially Degraded Service', color: '#f8a306', icon: 'exclamation-circle' },
  maintenance: { label: '服务维护中', en: 'Under Maintenance', color: '#1747f5', icon: 'wrench' },
  unknown: { label: '暂无监控数据', en: 'No Data', color: '#6c757d', icon: 'question-circle' }
})

/** 监控类型中文名 */
const TYPE_LABEL = {
  http: 'HTTP',
  'http-keyword': 'HTTP 关键词',
  'http-json-query': 'HTTP JSON',
  tcp: 'TCP',
  ping: 'PING',
  dns: 'DNS',
  push: 'PUSH',
  docker: 'Docker',
  grpc: 'gRPC',
  mqtt: 'MQTT',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  sqlserver: 'SQL Server',
  radius: 'Radius',
  steam: 'Steam',
  'real-browser': '浏览器',
  group: '分组'
}

/** 无数据时的中性色（对应状态页的 secondary） */
const NEUTRAL_COLOR = '#6c757d'

/**
 * 尺寸常量
 *
 * `BODY_PADDING` 必须与 `src/render.js` 的 `width + 56` 保持一致，
 * 否则截图右侧会被裁掉。
 */
const BODY_PADDING = 28
/** 监控列表卡片内边距 10px × 2 + 单个监控项左右内边距 15px × 2 */
const LIST_INNER_PADDING = 50
const BEAT_WIDTH = 10
const BEAT_HEIGHT = 30
const BEAT_GAP = 8
const BEAT_RADIUS = BEAT_WIDTH / 2

/** HTML 转义 */
export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const pad = (num) => String(num).padStart(2, '0')

/**
 * 格式化日期时间
 * @param {number} ts 时间戳
 * @param {string} [timezone] IANA 时区，留空使用系统时区
 */
export const formatTime = (ts, timezone) => {
  if (!Number.isFinite(ts)) return '—'
  const date = new Date(ts)

  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(date)

      const map = {}
      for (const part of parts) map[part.type] = part.value
      if (map.year && map.month && map.day) {
        return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
      }
    } catch { /* 时区非法时回退到系统时区 */ }
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * 格式化时分秒
 * @param {number} ts 时间戳
 * @param {string} [timezone] IANA 时区
 */
export const formatClock = (ts, timezone) => {
  const text = formatTime(ts, timezone)
  const index = text.indexOf(' ')
  return index === -1 ? text : text.slice(index + 1)
}

/**
 * 格式化时长
 * @param {number} ms 毫秒
 */
export const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) return '—'
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes < 60) return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`
}

/**
 * 格式化可用率
 *
 * 与状态页一致：先四舍五入到两位小数再拼 `%`，因此 100% 显示为 `100%` 而不是 `100.00%`。
 * @param {number|null} value 0 ~ 1
 */
export const formatUptime = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value <= 0) return '0%'
  const percent = Math.round(value * 10000) / 100
  return `${percent > 100 ? 100 : percent}%`
}

/**
 * 格式化响应时间
 * @param {number|null} value 毫秒
 */
export const formatPing = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
  return `${Math.round(value)} ms`
}

/**
 * 内联 SVG 图标
 *
 * 对齐状态页使用的实心图标风格：圆形图标用「实心圆 + 背景色镂空字形」，
 * 扳手这类本身没有外圆的图标直接填充状态色。
 * @param {string} key 图标名
 * @param {string} color 图标颜色
 * @param {string} knockout 镂空色（取卡片背景色）
 * @param {number} [size] 尺寸
 */
const svgIcon = (key, color, knockout, size = 24) => {
  const open = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`

  if (key === 'wrench') {
    return `${open}<path fill="${color}" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94` +
      `l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`
  }

  const glyph = {
    'check-circle': '<path d="M7.6 12.3l2.9 2.9 6-6.4"/>',
    'times-circle': '<path d="M9.1 9.1l5.8 5.8"/><path d="M14.9 9.1l-5.8 5.8"/>',
    'exclamation-circle': '<path d="M12 6.9v6.3"/>' +
      `<circle cx="12" cy="17" r="1.35" fill="${knockout}" stroke="none"/>`,
    'question-circle': '<path d="M9.6 9.9a2.7 2.7 0 015.2.6c0 1.7-2.6 2-2.6 3.6"/>' +
      `<circle cx="12" cy="17" r="1.35" fill="${knockout}" stroke="none"/>`
  }[key] || ''

  return `${open}<circle cx="12" cy="12" r="10" fill="${color}"/>` +
    `<g fill="none" stroke="${knockout}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">` +
    `${glyph}</g></svg>`
}

/**
 * 主题变量
 *
 * 深色取值与状态页深色主题一致（`#090c10` / `#0d1117` / `#b1b8c0`），
 * 浅色沿用其浅色主题（纯白底、卡片靠投影分层）。
 * @param {string} theme 主题
 */
const themeVars = (theme) => {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      card: '#ffffff',
      text: '#212529',
      muted: 'rgba(33, 37, 41, 0.75)',
      beatEmpty: '#f0f8ff'
    }
  }

  return {
    bg: '#090c10',
    card: '#0d1117',
    text: '#b1b8c0',
    muted: 'rgba(177, 184, 192, 0.75)',
    beatEmpty: '#848484'
  }
}

/**
 * 胶囊徽章的文字颜色
 *
 * 状态页只在深色主题下给绿色徽章配深色文字，其余一律白字。
 * @param {string} key 状态 key
 * @param {string} theme 主题
 */
const badgeTextColor = (key, theme) => (theme === 'dark' && key === 'up' ? '#020b05' : '#ffffff')

/**
 * 公共样式
 * @param {string} theme 主题
 */
const baseCss = (theme) => {
  const vars = themeVars(theme)

  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    background: ${vars.bg};
    color: ${vars.text};
    font-family: "Twemoji Country Flags", BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
      Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
      "WenQuanYi Micro Hei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol",
      "Noto Color Emoji";
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  body { padding: ${BODY_PADDING}px; }
  .shadow-box {
    background: ${vars.card};
    border-radius: 10px;
    box-shadow: 0 15px 70px rgba(0, 0, 0, 0.1);
    padding: 10px;
  }
  .title { font-size: 30px; font-weight: 500; line-height: 1.2; margin-bottom: 24px; }
  .overall {
    display: flex; align-items: center; gap: 10px;
    padding: 24px; margin-bottom: 24px;
    font-size: 25px; font-weight: 700;
  }
  .overall .icon { display: flex; align-items: center; flex: 0 0 auto; }
  .overall .spacer { margin-left: auto; }
  .desc { padding: 8px; margin-bottom: 16px; white-space: pre-line; }
  .group { margin-bottom: 48px; }
  .group-title { font-size: 26px; font-weight: 500; line-height: 1.2; }
  .monitor-list { position: relative; min-height: 46px; margin-top: 24px; }
  .item { padding: 13px 15px 10px; border-radius: 10px; }
  .info { display: flex; align-items: center; white-space: nowrap; overflow: hidden; }
  .badge {
    flex: 0 0 auto; display: inline-block; min-width: 62px; text-align: center;
    padding: .35em .65em; font-size: .75em; font-weight: 700; line-height: 1;
    border-radius: 999px;
  }
  .item-name {
    flex: 1 1 auto; min-width: 0; padding: 0 5px;
    display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .beats { display: flex; align-items: center; gap: ${BEAT_GAP}px; height: ${BEAT_HEIGHT}px; margin-top: 12px; }
  .beat {
    flex: 0 0 ${BEAT_WIDTH}px; width: ${BEAT_WIDTH}px; height: ${BEAT_HEIGHT}px;
    border-radius: ${BEAT_RADIUS}px;
  }
  .beat.empty { background: ${vars.beatEmpty}; }
  .empty-tip { position: absolute; left: 0; top: 20px; width: 100%; text-align: center; }
  .detail-sub { margin: -16px 0 24px; font-size: 14px; color: ${vars.muted}; }
  .beats-box { padding: 15px; }
  .beats-box .beats { margin-top: 0; }
  .stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    margin-top: 24px; padding: 20px 24px;
  }
  .stat { text-align: center; }
  .stat + .stat { border-left: 1px solid ${theme === 'light' ? 'rgba(33, 37, 41, 0.1)' : 'rgba(177, 184, 192, 0.15)'}; }
  .stat b { display: block; font-size: 19px; font-weight: 700; }
  .stat span { display: block; margin-top: 6px; font-size: 12px; color: ${vars.muted}; }
  .ft { margin-top: 48px; margin-bottom: 24px; text-align: center; font-size: 14px; }
  .ft p { margin-bottom: 16px; }
  .refresh-info { opacity: .7; }
  `
}

/**
 * 一行能放下多少根心跳条
 * @param {number} width 页面宽度
 * @param {number} innerPadding 卡片 + 监控项的左右内边距之和
 */
const beatSlots = (width, innerPadding = LIST_INNER_PADDING) => {
  const available = width - BODY_PADDING * 2 - innerPadding
  return Math.max(1, Math.floor((available + BEAT_GAP) / (BEAT_WIDTH + BEAT_GAP)))
}

/**
 * 生成心跳条
 *
 * 心跳条数量固定为 `slots`：不足时左侧补空槽位（与状态页一致，最新的一次贴右边），
 * 超出时只保留最近的一部分。
 * @param {any[]} heartbeats 心跳列表（按时间升序）
 * @param {number} slots 一行能放下的数量
 * @param {{ timezone?: string }} [options]
 */
const buildBeats = (heartbeats, slots, options = {}) => {
  const list = Array.isArray(heartbeats) ? heartbeats : []
  const recent = list.length > slots ? list.slice(list.length - slots) : list
  const bars = []

  for (let i = recent.length; i < slots; i++) bars.push('<i class="beat empty"></i>')

  for (const beat of recent) {
    const meta = STATUS_META[beat.status] || STATUS_META[STATUS.PENDING]
    const title = options.timezone
      ? `${formatTime(beat.time, options.timezone)} ${meta.label}`
      : `${meta.label}`
    bars.push(`<i class="beat" title="${escapeHtml(title)}" style="background:${meta.color}"></i>`)
  }

  return bars.join('')
}

/**
 * 生成单个监控项
 * @param {any} monitor 监控项
 * @param {number} slots 心跳条槽位数量
 * @param {{ theme?: string, timezone?: string }} options
 */
const buildMonitorRow = (monitor, slots, options) => {
  const meta = monitor.status === null ? null : STATUS_META[monitor.status]
  const name = escapeHtml(monitor.name)
  const uptime = formatUptime(monitor.uptime24)
  const badgeBg = meta ? meta.color : NEUTRAL_COLOR
  const badgeFg = meta ? badgeTextColor(meta.key, options.theme) : '#ffffff'

  return `
        <div class="item">
          <div class="info">
            <span class="badge" style="background:${badgeBg};color:${badgeFg}">${uptime}</span>
            <span class="item-name" title="${name}">${name}</span>
          </div>
          <div class="beats">${buildBeats(monitor.heartbeats, slots, options)}</div>
        </div>`
}

/**
 * 生成整页状态图 HTML
 * @param {any} snapshot 快照
 * @param {{ theme?: string, timezone?: string, width?: number, interval?: number, maxHeartbeats?: number }} [options]
 */
export const buildStatusHtml = (snapshot, options = {}) => {
  const theme = options.theme === 'light' ? 'light' : 'dark'
  const vars = themeVars(theme)
  const width = Number(options.width) || 1000
  const slots = beatSlots(width)
  const summary = snapshot.summary || {}
  const overall = OVERALL_META[summary.overall] || OVERALL_META.unknown
  const title = escapeHtml(snapshot.title || '监控状态页')

  const groups = (snapshot.groups || []).map((group) => {
    const monitors = group.monitors.length
      ? group.monitors.map((monitor) => buildMonitorRow(monitor, slots, options)).join('')
      : '<div class="empty-tip">该分组暂无监控项</div>'

    return `
      <div class="group">
        <h2 class="group-title">${escapeHtml(group.name)}</h2>
        <div class="shadow-box monitor-list">${monitors}
        </div>
      </div>`
  }).join('')

  const body = snapshot.groups?.length
    ? groups
    : '<div class="shadow-box monitor-list"><div class="empty-tip">状态页暂无公开监控项，请检查监控面板中分组的「公开」设置</div></div>'

  /** 描述紧跟在整体状态卡片之后，与状态页的排版顺序一致 */
  const description = snapshot.description
    ? `<div class="desc">${escapeHtml(snapshot.description)}</div>`
    : ''

  const interval = Number(options.interval)
  const intervalLine = Number.isFinite(interval) && interval > 0
    ? `<div>状态每 ${interval} 秒检测一次</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  ${baseCss(theme)}
  .page { width: ${width}px; margin: 0 auto; }
</style>
</head>
<body>
  <div class="page">
    <h1 class="title">${title}</h1>
    <div class="shadow-box overall">
      <span class="icon">${svgIcon(overall.icon, overall.color, vars.card, 26)}</span>
      <span>${overall.label}</span>
    </div>
    ${description}
    ${body}
    <footer class="ft">
      <p>karin-plugin-server-status</p>
      <div class="refresh-info">
        <div>更新于 ${formatTime(snapshot.fetchedAt, options.timezone)}</div>
        ${intervalLine}
      </div>
    </footer>
  </div>
</body>
</html>`
}

/**
 * 生成单个监控项详情图 HTML
 * @param {any} monitor 监控项
 * @param {any} snapshot 快照
 * @param {{ theme?: string, timezone?: string, width?: number, maxHeartbeats?: number }} [options]
 */
export const buildMonitorHtml = (monitor, snapshot, options = {}) => {
  const theme = options.theme === 'light' ? 'light' : 'dark'
  const vars = themeVars(theme)
  const width = Number(options.width) || 1000
  const slots = beatSlots(width)
  const meta = monitor.status === null ? null : STATUS_META[monitor.status]
  const status = meta || { key: 'unknown', label: '无数据', en: 'No Data', color: NEUTRAL_COLOR, icon: 'question-circle' }
  const name = escapeHtml(monitor.name)

  const typeLabel = TYPE_LABEL[monitor.type] || String(monitor.type || '未知').toUpperCase()
  const beats = monitor.allHeartbeats || []
  const downCount = beats.filter((beat) => beat.status === STATUS.DOWN).length
  const lastCheck = monitor.latest ? formatTime(monitor.latest.time, options.timezone) : '—'

  const subParts = [typeLabel]
  if (monitor.group) subParts.push(monitor.group)
  if (monitor.url) subParts.push(monitor.url)

  const badgeBg = meta ? meta.color : NEUTRAL_COLOR
  const badgeFg = meta ? badgeTextColor(meta.key, theme) : '#ffffff'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${name}</title>
<style>
  ${baseCss(theme)}
  .page { width: ${width}px; margin: 0 auto; }
</style>
</head>
<body>
  <div class="page">
    <h1 class="title">${name}</h1>
    <div class="detail-sub">${subParts.map((part) => escapeHtml(part)).join(' · ')}</div>
    <div class="shadow-box overall">
      <span class="icon">${svgIcon(status.icon, status.color, vars.card, 26)}</span>
      <span>${status.label}</span>
      <span class="spacer"></span>
      <span class="badge" style="background:${badgeBg};color:${badgeFg}">${formatUptime(monitor.uptime24)}</span>
    </div>
    <div class="shadow-box monitor-list beats-box">
      <div class="beats">${buildBeats(beats, slots, options)}</div>
    </div>
    <div class="shadow-box stats">
      <div class="stat"><b>${formatUptime(monitor.uptime24)}</b><span>24 小时可用率</span></div>
      <div class="stat"><b>${formatPing(monitor.avgPing)}</b><span>平均响应</span></div>
      <div class="stat"><b>${formatPing(monitor.latest?.ping)}</b><span>最近响应</span></div>
      <div class="stat"><b>${downCount}</b><span>异常次数</span></div>
    </div>
    <footer class="ft">
      <p>karin-plugin-server-status</p>
      <div class="refresh-info">
        <div>最后检测 ${lastCheck} · 异常 ${downCount} 次${snapshot?.slug ? ` · /status/${escapeHtml(snapshot.slug)}` : ''}</div>
      </div>
    </footer>
  </div>
</body>
</html>`
}

/**
 * 纯文本状态报告（无渲染器时的降级方案）
 * @param {any} snapshot 快照
 * @param {{ timezone?: string }} [options]
 */
export const buildTextReport = (snapshot, options = {}) => {
  const summary = snapshot.summary || {}
  const overall = OVERALL_META[summary.overall] || OVERALL_META.unknown
  const lines = [
    `【${snapshot.title || '监控状态页'}】${overall.label}`,
    `共 ${summary.total || 0} 个监控 · 正常 ${summary.up || 0} · 异常 ${summary.down || 0}`,
    ''
  ]

  for (const group of snapshot.groups || []) {
    lines.push(`◆ ${group.name}`)
    for (const monitor of group.monitors) {
      const meta = STATUS_META[monitor.status] || { label: '无数据' }
      const last = monitor.latest ? formatClock(monitor.latest.time, options.timezone) : '—'
      lines.push(`· ${monitor.name} [${meta.label}] 可用率 ${formatUptime(monitor.uptime24)} 响应 ${formatPing(monitor.latest?.ping)} 最后 ${last}`)
    }
    lines.push('')
  }

  lines.push(`更新于 ${formatTime(snapshot.fetchedAt, options.timezone)}`)
  return lines.join('\n').trim()
}
