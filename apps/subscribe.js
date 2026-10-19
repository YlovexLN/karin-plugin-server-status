/**
 * 订阅管理指令（仅主人可用）
 *
 * #监控订阅   把当前群/私聊加入告警推送目标
 * #监控退订   从推送目标中移除当前群/私聊
 * #监控目标   查看当前推送目标
 * #监控帮助   查看帮助
 */

import { karin } from 'node-karin'
import { getConfig, saveConfig } from '../src/config.js'
import { StatusClient } from '../src/client.js'
import { filterSnapshot } from '../src/engine.js'
import { renderStatusImage } from '../src/render.js'
import { describeTarget, normalizeTarget, parseTargetList, pushMessage, resolveTargets } from '../src/notify.js'

/** 当前会话是否可作为推送目标 */
const currentTarget = (e) => {
  const scene = e.contact.scene === 'group' ? 'group' : (e.contact.scene === 'friend' ? 'friend' : '')
  if (!scene) return null
  return normalizeTarget({ scene, peer: String(e.contact.peer), name: e.contact.name || '' })
}

/**
 * #监控订阅
 */
export const statusSubscribe = karin.command(
  /^#?(?:监控|server-status)\s*(?:订阅|subscribe)$/i,
  async (e) => {
    const target = currentTarget(e)
    if (!target) {
      await e.reply('当前会话类型不支持订阅，请在群聊或私聊中使用')
      return true
    }

    const cfg = getConfig()
    const list = parseTargetList(cfg.targets)

    if (list.some((item) => item.scene === target.scene && item.peer === target.peer)) {
      await e.reply(`当前${target.scene === 'group' ? '群聊' : '私聊'}已在告警推送列表中，无需重复订阅`)
      return true
    }

    saveConfig({
      targets: [...(cfg.targets || []), target]
    })

    await e.reply([
      '✅ 订阅成功',
      `推送目标：${describeTarget(target)}`,
      '之后监控出现异常或恢复时会在这里收到通知。'
    ].join('\n'))

    return true
  },
  {
    name: '监控订阅',
    perm: 'master',
    log: true
  }
)

/**
 * #监控退订
 */
export const statusUnsubscribe = karin.command(
  /^#?(?:监控|server-status)\s*(?:退订|取消订阅|unsubscribe)$/i,
  async (e) => {
    const target = currentTarget(e)
    if (!target) {
      await e.reply('当前会话类型不支持退订')
      return true
    }

    const cfg = getConfig()
    const list = parseTargetList(cfg.targets)
    const next = list.filter((item) => !(item.scene === target.scene && item.peer === target.peer))

    if (next.length === list.length) {
      await e.reply('当前会话不在告警推送列表中')
      return true
    }

    saveConfig({
      targets: next.map((item) => ({
        selfId: item.selfId || undefined,
        scene: item.scene,
        peer: item.peer,
        name: item.name || undefined
      }))
    })

    await e.reply(`✅ 已取消订阅：${describeTarget(target)}`)
    return true
  },
  {
    name: '监控退订',
    perm: 'master',
    log: true
  }
)

/**
 * #监控目标
 */
export const statusTargets = karin.command(
  /^#?(?:监控|server-status)\s*(?:目标|推送目标|targets)$/i,
  async (e) => {
    const cfg = getConfig()
    const configured = parseTargetList(cfg.targets)
    const effective = resolveTargets(cfg)

    const lines = ['📮 告警推送目标', '']

    if (configured.length === 0) {
      lines.push('未配置 targets')
    } else {
      configured.forEach((item, index) => {
        lines.push(`${index + 1}. ${describeTarget(item)}${item.selfId ? ` · Bot ${item.selfId}` : ''}`)
      })
    }

    if (configured.length === 0 && effective.length > 0) {
      lines.push('')
      lines.push(`当前回退到机器人主人：${effective.map((item) => item.peer).join('、')}`)
    }

    lines.push('')
    lines.push('发送 #监控订阅 可把当前会话加入推送目标')

    await e.reply(lines.join('\n'))
    return true
  },
  {
    name: '监控目标',
    perm: 'master',
    log: true
  }
)

/**
 * #监控测试推送
 */
export const statusTestPush = karin.command(
  /^#?(?:监控|server-status)\s*(?:测试推送|推送测试|test)$/i,
  async (e) => {
    const cfg = getConfig()

    try {
      const client = new StatusClient(cfg)
      const snapshot = filterSnapshot(await client.getSnapshot(), cfg)
      const image = await renderStatusImage(snapshot, cfg)

      const result = await pushMessage(
        cfg,
        '🔔 这是一条来自 karin-plugin-server-status 的测试推送，收到说明告警链路正常。',
        image
      )

      if (result.total === 0) {
        await e.reply('没有可用的推送目标，请先配置 targets 或发送 #监控订阅')
        return true
      }

      await e.reply(`✅ 测试推送完成：成功 ${result.success}/${result.total}\n${image ? '（含状态截图）' : '（仅文本，渲染器不可用）'}`)
    } catch (error) {
      await e.reply(`❌ 测试推送失败：${error?.message || error}`)
    }

    return true
  },
  {
    name: '监控测试推送',
    perm: 'master',
    log: true
  }
)

/**
 * #监控帮助
 */
export const statusHelp = karin.command(
  /^#?(?:监控|server-status)\s*(?:帮助|help|菜单|menu)$/i,
  async (e) => {
    const cfg = getConfig()
    const lines = [
      '📊 服务器状态监控插件',
      '',
      '#监控状态        查看整体状态图',
      '#监控详情 <名称> 查看单个监控项详情',
      '#监控检测        立即检测一次',
      '#监控订阅        把当前会话加入告警推送（主人）',
      '#监控退订        取消当前会话的告警推送（主人）',
      '#监控目标        查看推送目标（主人）',
      '#监控测试推送    发送一条测试告警（主人）',
      '',
      `面板：${cfg.statusUrl}`,
      `状态页：${cfg.statusSlug}`,
      `检测间隔：${cfg.interval} 秒`,
      `自动告警：${cfg.enable ? '已开启' : '已关闭'}`
    ]

    await e.reply(lines.join('\n'))
    return true
  },
  {
    name: '监控帮助',
    perm: 'all',
    log: true
  }
)
