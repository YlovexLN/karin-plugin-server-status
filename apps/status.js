/**
 * 查询类指令
 *
 * #监控状态          查看整体状态图
 * #监控详情 [关键词] 查看单个监控项详情图
 * #监控检测          立即检测一次
 */

import { karin, segment } from 'node-karin'
import { getConfig } from '../src/config.js'
import { StatusClient } from '../src/client.js'
import { filterSnapshot } from '../src/engine.js'
import { runCheck } from '../src/monitor.js'
import { renderMonitorImage, renderStatusImage } from '../src/render.js'
import { buildTextReport, formatPing, formatUptime } from '../src/template.js'

/** 拉取并过滤快照 */
const fetchSnapshot = async () => {
  const cfg = getConfig()
  const client = new StatusClient(cfg)
  const snapshot = filterSnapshot(await client.getSnapshot(), cfg)
  return { cfg, snapshot }
}

/** 状态汇总文本 */
const summaryText = (snapshot) => {
  const summary = snapshot.summary
  const parts = [
    `共 ${summary.total} 个监控`,
    `正常 ${summary.up}`,
    `异常 ${summary.down}`
  ]
  if (summary.pending) parts.push(`待确认 ${summary.pending}`)
  if (summary.maintenance) parts.push(`维护 ${summary.maintenance}`)
  return parts.join(' · ')
}

/**
 * #监控状态
 */
export const statusOverview = karin.command(
  /^#?(?:监控|server-status)\s*(?:状态|status|面板)$/i,
  async (e) => {
    try {
      const { cfg, snapshot } = await fetchSnapshot()

      if (snapshot.summary.total === 0) {
        await e.reply('状态页中没有公开的监控项，请在监控面板中把分组设为「公开」')
        return true
      }

      const image = await renderStatusImage(snapshot, cfg)

      if (image) {
        await e.reply([
          segment.image(`base64://${image}`),
          segment.text(`\n${summaryText(snapshot)}`)
        ])
      } else {
        await e.reply(buildTextReport(snapshot, cfg))
      }
    } catch (error) {
      await e.reply([
        '❌ 获取监控状态失败',
        `原因：${error?.message || error}`,
        '请检查 config.json 中的 statusUrl、statusSlug 是否正确，以及状态页是否已发布。'
      ].join('\n'))
    }

    return true
  },
  {
    name: '监控状态',
    perm: 'all',
    log: true
  }
)

/**
 * 提取指令参数
 * - 不同版本 Karin 对正则捕获组的暴露方式不同，这里做兼容处理
 * @param {any} e 事件对象
 * @param {RegExp} reg 指令正则
 */
const extractKeyword = (e, reg) => {
  if (Array.isArray(e.matched) && e.matched[1] !== undefined) {
    return String(e.matched[1]).trim()
  }

  const matched = String(e.msg || '').match(reg)
  return matched && matched[1] ? String(matched[1]).trim() : ''
}

/**
 * #监控详情 [关键词]
 */
export const statusDetail = karin.command(
  /^#?(?:监控|server-status)\s*(?:详情|detail)\s*(.*)$/i,
  async (e) => {
    const keyword = extractKeyword(e, /^#?(?:监控|server-status)\s*(?:详情|detail)\s*(.*)$/i)

    try {
      const { cfg, snapshot } = await fetchSnapshot()

      if (snapshot.monitors.length === 0) {
        await e.reply('状态页中没有公开的监控项')
        return true
      }

      if (!keyword) {
        const lines = ['请指定监控项名称或 ID，例如：#监控详情 Web', '', '当前监控项：']
        for (const monitor of snapshot.monitors) {
          lines.push(`· [${monitor.id}] ${monitor.name} — ${formatUptime(monitor.uptime24)} / ${formatPing(monitor.latest?.ping)}`)
        }
        await e.reply(lines.join('\n'))
        return true
      }

      const lower = keyword.toLowerCase()
      const matched = snapshot.monitors.filter((monitor) =>
        String(monitor.id) === keyword || monitor.name.toLowerCase().includes(lower)
      )

      if (matched.length === 0) {
        await e.reply(`未找到匹配「${keyword}」的监控项，可发送 #监控详情 查看列表`)
        return true
      }

      const monitor = matched[0]
      const image = await renderMonitorImage(monitor, snapshot, cfg)
      const footer = matched.length > 1 ? `\n匹配到 ${matched.length} 个，已展示第一个：${monitor.name}` : ''

      if (image) {
        const elements = [segment.image(`base64://${image}`)]
        if (footer) elements.push(segment.text(footer))
        await e.reply(elements)
      } else {
        const lines = [
          `【${monitor.name}】`,
          `状态：${monitor.status === null ? '无数据' : ['故障', '正常', '待确认', '维护中'][monitor.status] || '未知'}`,
          `24 小时可用率：${formatUptime(monitor.uptime24)}`,
          `最近响应：${formatPing(monitor.latest?.ping)}`,
          `平均响应：${formatPing(monitor.avgPing)}`,
          footer
        ]
        await e.reply(lines.join('\n'))
      }
    } catch (error) {
      await e.reply(`❌ 获取监控详情失败：${error?.message || error}`)
    }

    return true
  },
  {
    name: '监控详情',
    perm: 'all',
    log: true
  }
)

/**
 * #监控检测
 */
export const statusCheck = karin.command(
  /^#?(?:监控|server-status)\s*(?:检测|检查|check|poll)$/i,
  async (e) => {
    const result = await runCheck({ force: true, manual: true })

    if (!result.ok) {
      const lines = [`❌ 检测失败：${result.error || '未知错误'}`]
      if ((result.changes || []).some((change) => change.type === 'source-down')) {
        lines.push(result.notifications?.success
          ? '已发送面板不可达通知'
          : '没有可用的推送目标，未发送面板不可达通知')
      }
      await e.reply(lines.join('\n'))
      return true
    }

    if (result.skipped) {
      await e.reply(`⏳ ${result.error || '检测已跳过'}`)
      return true
    }

    const total = result.snapshot?.summary?.total ?? 0
    const changes = result.changes || []
    const notifications = result.notifications || { total: 0, success: 0 }
    const lines = [`✅ 检测完成，共 ${total} 个监控`]

    if (changes.length === 0) {
      lines.push('状态无变化')
    } else {
      lines.push('本次事件：')
      for (const change of changes) {
        if (change.type === 'down') lines.push(`· 异常：${change.monitor}（${change.label}）`)
        else if (change.type === 'up') lines.push(`· 恢复：${change.monitor}`)
        else if (change.type === 'repeat') lines.push(`· 仍未恢复：${change.monitor}`)
        else if (change.type === 'source-down') lines.push('· 面板不可达')
        else if (change.type === 'source-up') lines.push('· 面板已恢复')
      }
      lines.push('')

      if (result.notified === false) {
        lines.push('本次检测未发送通知')
      } else if (notifications.total === 0) {
        lines.push('没有可用的推送目标，本次未发送通知')
      } else if (notifications.success === notifications.total) {
        lines.push(`通知已发送（成功 ${notifications.success}/${notifications.total}）`)
      } else {
        lines.push(`通知发送完成：成功 ${notifications.success}/${notifications.total}，部分目标失败，请查看日志`)
      }
    }

    await e.reply(lines.join('\n'))
    return true
  },
  {
    name: '监控检测',
    perm: 'all',
    log: true
  }
)
