/**
 * 消息推送
 *
 * 负责把告警文本 + 状态图发送到配置的群聊/私聊。
 * 未配置 targets 时可回退到机器人主人。
 */

import { karin, segment, logger, config } from 'node-karin'
import { formatClock, formatDuration, formatTime } from './template.js'

/**
 * 解析单个推送目标
 * @param {any} item 配置项
 * @returns {{ selfId: string, scene: 'group'|'friend', peer: string, name?: string }|null}
 */
const parseTarget = (item) => {
  if (!item) return null

  if (typeof item === 'string') {
    const text = item.trim()
    if (!text) return null

    const matched = text.match(/^(group|friend|private|群|私聊)[:：](.+)$/i)
    if (matched) {
      const scene = /group|群/i.test(matched[1]) ? 'group' : 'friend'
      return { selfId: '', scene, peer: matched[2].trim() }
    }

    return { selfId: '', scene: 'friend', peer: text }
  }

  if (typeof item !== 'object') return null

  const peer = String(item.peer ?? item.id ?? item.groupId ?? item.userId ?? '').trim()
  if (!peer) return null

  const sceneText = String(item.scene ?? item.type ?? '').toLowerCase()
  const scene = sceneText === 'group' || sceneText === '群' ? 'group' : 'friend'

  return {
    selfId: item.selfId ? String(item.selfId) : '',
    scene,
    peer,
    name: item.name ? String(item.name) : undefined
  }
}

/**
 * 获取一个可用的 Bot ID
 * @returns {string}
 */
const pickBotId = () => {
  try {
    const bots = karin.getAllBot()
    return bots?.[0]?.selfId ? String(bots[0].selfId) : ''
  } catch {
    return ''
  }
}

/**
 * 主人列表转推送目标
 * @returns {Array<{ selfId: string, scene: 'friend', peer: string }>}
 */
const masterTargets = () => {
  try {
    const list = config.master() || []
    return list.map((item) => {
      const text = String(item)
      if (text.includes('@')) {
        const [selfId, userId] = text.split('@')
        return { selfId, scene: 'friend', peer: userId }
      }
      return { selfId: '', scene: 'friend', peer: text }
    }).filter((item) => item.peer)
  } catch {
    return []
  }
}

/**
 * 解析目标列表（不做主人回退）
 * @param {any[]} items 原始配置
 * @returns {Array<{ selfId: string, scene: 'group'|'friend', peer: string, name?: string }>}
 */
export const parseTargetList = (items) => {
  const list = []
  const seen = new Set()

  for (const item of items || []) {
    const target = parseTarget(item)
    if (!target) continue
    const key = `${target.scene}:${target.peer}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push(target)
  }

  return list
}

/**
 * 解析全部推送目标（含主人回退）
 * @param {any} cfg 插件配置
 * @returns {Array<{ selfId: string, scene: 'group'|'friend', peer: string, name?: string }>}
 */
export const resolveTargets = (cfg) => {
  const list = parseTargetList(cfg.targets)
  const seen = new Set(list.map((target) => `${target.scene}:${target.peer}`))

  if (list.length === 0 && cfg.fallbackToMaster !== false) {
    for (const target of masterTargets()) {
      const key = `${target.scene}:${target.peer}`
      if (seen.has(key)) continue
      seen.add(key)
      list.push(target)
    }
  }

  return list
}

/**
 * 目标转联系对象
 * @param {{ scene: 'group'|'friend', peer: string }} target 目标
 */
export const toContact = (target) => {
  if (target.scene === 'group') return karin.contactGroup(target.peer)
  return karin.contactFriend(target.peer)
}

/**
 * 目标描述
 * @param {{ scene: 'group'|'friend', peer: string, name?: string }} target 目标
 */
export const describeTarget = (target) => {
  const scene = target.scene === 'group' ? '群聊' : '私聊'
  return `${scene} ${target.name ? `${target.name}(${target.peer})` : target.peer}`
}

/**
 * 推送消息
 * @param {any} cfg 插件配置
 * @param {string} text 文本内容
 * @param {string|null} [image] base64 图片
 * @returns {Promise<{ total: number, success: number }>}
 */
export const pushMessage = async (cfg, text, image = null) => {
  const targets = resolveTargets(cfg)
  if (targets.length === 0) {
    logger.warn('[server-status] 没有可用的推送目标：请在 config.json 的 targets 中配置群号/QQ，或开启 fallbackToMaster')
    return { total: 0, success: 0 }
  }

  let success = 0

  for (const target of targets) {
    const selfId = target.selfId || pickBotId()
    if (!selfId) {
      logger.warn('[server-status] 没有在线的 Bot，跳过推送')
      continue
    }

    /** 每个目标单独构建消息体，避免适配器内部修改数组 */
    const elements = []
    if (text) elements.push(segment.text(text))
    if (image) elements.push(segment.image(`base64://${image}`))

    try {
      await karin.sendMsg(selfId, toContact(target), elements, { retryCount: 2 })
      success++
    } catch (error) {
      logger.error(`[server-status] 推送到 ${describeTarget(target)} 失败：${error?.message || error}`)
    }
  }

  return { total: targets.length, success }
}

/**
 * 构造异常告警文本
 * @param {Array<{ monitor: any, label: string, since: number }>} items 异常项
 * @param {{ timezone?: string }} [options] 选项
 */
export const buildDownText = (items, options = {}) => {
  const lines = ['🔴 服务监控告警']
  lines.push(`时间：${formatTime(Date.now(), options.timezone)}`)
  lines.push(`检测到 ${items.length} 个监控项异常：`)
  lines.push('')

  for (const item of items) {
    const { monitor } = item
    const typeLabel = monitor.type ? String(monitor.type).toUpperCase() : '未知'
    lines.push(`· ${monitor.name}（${typeLabel}）— ${item.label}`)
    const since = item.since ? `，已持续 ${formatDuration(Date.now() - item.since)}` : ''
    lines.push(`  最后检测 ${formatClock(monitor.latest?.time, options.timezone)}${since}`)
  }

  lines.push('')
  lines.push('详细状态见下方截图。')
  return lines.join('\n')
}

/**
 * 构造恢复文本
 * @param {Array<{ monitor: any, downSince: number }>} items 恢复项
 * @param {{ timezone?: string }} [options] 选项
 */
export const buildUpText = (items, options = {}) => {
  const lines = ['🟢 服务监控恢复']
  lines.push(`时间：${formatTime(Date.now(), options.timezone)}`)
  lines.push('')

  for (const item of items) {
    const duration = item.downSince ? `，中断时长 ${formatDuration(Date.now() - item.downSince)}` : ''
    lines.push(`· ${item.monitor.name} 已恢复正常${duration}`)
  }

  return lines.join('\n')
}

/**
 * 构造重复提醒文本
 * @param {Array<{ monitor: any, downSince: number, notifyCount: number }>} items 仍未恢复项
 * @param {{ timezone?: string }} [options] 选项
 */
export const buildRepeatText = (items, options = {}) => {
  const lines = ['🟠 服务仍未恢复']
  lines.push(`时间：${formatTime(Date.now(), options.timezone)}`)
  lines.push('')

  for (const item of items) {
    const duration = item.downSince ? `已持续 ${formatDuration(Date.now() - item.downSince)}` : '仍在异常'
    lines.push(`· ${item.monitor.name} — ${duration}（第 ${item.notifyCount} 次提醒）`)
  }

  return lines.join('\n')
}

/**
 * 构造面板不可达文本
 * @param {{ url: string, retries: number, error: string, downSince: number }} info 信息
 * @param {{ timezone?: string }} [options] 选项
 */
export const buildSourceDownText = (info, options = {}) => {
  const lines = ['⚠️ 监控面板不可达']
  lines.push(`时间：${formatTime(Date.now(), options.timezone)}`)
  lines.push(`地址：${info.url}`)
  lines.push(`连续失败：${info.retries} 次`)
  lines.push(`错误：${info.error || '未知错误'}`)
  if (info.downSince) lines.push(`已持续：${formatDuration(Date.now() - info.downSince)}`)
  lines.push('')
  lines.push('监控数据可能已停止更新，请检查面板服务与网络。')
  return lines.join('\n')
}

/**
 * 构造面板恢复文本
 * @param {{ url: string, downSince: number }} info 信息
 * @param {{ timezone?: string }} [options] 选项
 */
export const buildSourceUpText = (info, options = {}) => {
  const lines = ['✅ 监控面板已恢复']
  lines.push(`时间：${formatTime(Date.now(), options.timezone)}`)
  lines.push(`地址：${info.url}`)
  if (info.downSince) lines.push(`中断时长：${formatDuration(Date.now() - info.downSince)}`)
  return lines.join('\n')
}
