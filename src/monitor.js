/**
 * 监控引擎
 *
 * 定时拉取状态页数据，对比上一次状态，产生告警/恢复事件。
 */

import { logger } from 'node-karin'
import { dir, getConfig } from './config.js'
import { StatusClient } from './client.js'
import { StateStore } from './state.js'
import { evaluate, filterSnapshot } from './engine.js'
import { renderStatusImage } from './render.js'
import {
  buildDownText,
  buildSourceDownText,
  buildSourceUpText,
  buildRepeatText,
  buildUpText,
  pushMessage
} from './notify.js'

/** @type {StateStore|null} */
let store = null

/** 是否正在执行 */
let running = false
/** 上次执行时间 */
let lastCheckAt = 0
/** 上次执行结果 */
let lastResult = {
  ok: true,
  skipped: false,
  changes: [],
  notifications: { total: 0, success: 0 },
  notified: true,
  error: ''
}

/** 获取状态存储（懒加载） */
const getStore = () => {
  if (!store) store = new StateStore(dir.stateFile)
  return store
}

/**
 * 处理面板请求失败
 * @param {any} cfg 配置
 * @param {StateStore} state 状态
 * @param {Error} error 错误
 * @param {StatusClient} client 客户端
 * @param {boolean} notify 是否允许推送
 */
const handleSourceFailure = async (cfg, state, error, client, notify) => {
  const previous = state.source
  const failing = (Number(previous.failing) || 0) + 1
  const now = Date.now()

  state.setSource({ failing, lastError: error?.message || String(error) })

  if (!cfg.notifySourceDown) return { changes: [], push: null }

  /**
   * 从未成功连接过面板时（通常是刚装好还没配置地址）不告警，
   * 避免默认配置下对着 127.0.0.1:3001 反复刷「面板不可达」。
   */
  if (!previous.everUp) return { changes: [], push: null }

  const shouldAlert = !previous.down && failing >= cfg.sourceDownRetries
  const shouldRepeat = previous.down && cfg.repeatInterval > 0 &&
    previous.lastNotifyAt > 0 && now - previous.lastNotifyAt >= cfg.repeatInterval * 60000

  if (!shouldAlert && !shouldRepeat) return { changes: [], push: null }

  const downSince = previous.down ? previous.downSince : now
  state.setSource({
    down: true,
    downSince,
    lastNotifyAt: now,
    lastError: error?.message || String(error)
  })

  const text = buildSourceDownText({
    url: client.base,
    retries: failing,
    error: error?.message || String(error),
    downSince: previous.down ? downSince : 0
  }, cfg)

  const push = notify ? await pushMessage(cfg, text, null) : null

  return { changes: [{ type: 'source-down', text }], push }
}

/**
 * 处理面板恢复
 * @param {any} cfg 配置
 * @param {StateStore} state 状态
 * @param {StatusClient} client 客户端
 * @param {boolean} notify 是否允许推送
 */
const handleSourceRecover = async (cfg, state, client, notify) => {
  const previous = state.source

  /** 记录「曾经成功连上过面板」，用于面板掉线告警的前置判断 */
  if (!previous.everUp) state.setSource({ everUp: true })

  if (!previous.down) {
    if (previous.failing) state.setSource({ failing: 0, lastError: '' })
    return { changes: [], push: null }
  }

  state.setSource({ down: false, failing: 0, downSince: 0, lastNotifyAt: 0, lastError: '' })

  const text = buildSourceUpText({ url: client.base, downSince: previous.downSince }, cfg)
  const push = notify ? await pushMessage(cfg, text, null) : null

  return { changes: [{ type: 'source-up', text }], push }
}

/**
 * 执行一次检测
 * @param {{ force?: boolean, manual?: boolean, notify?: boolean }} [options] 选项
 * @returns {Promise<{
 *   ok: boolean,
 *   skipped: boolean,
 *   changes: any[],
 *   notifications: { total: number, success: number },
 *   notified: boolean,
 *   snapshot?: any,
 *   error?: string
 * }>}
 */
export const runCheck = async (options = {}) => {
  const cfg = getConfig()
  const force = options.force === true
  const manual = options.manual === true
  const notify = options.notify !== false
  /** 本次检测累计的推送结果（按消息条数统计） */
  const notifications = { total: 0, success: 0 }
  const addPush = (result) => {
    if (!result) return
    notifications.total += Number(result.total) || 0
    notifications.success += Number(result.success) || 0
  }

  if (!cfg.enable && !manual) {
    lastResult = { ok: true, skipped: true, changes: [], notifications, notified: notify, error: '' }
    return lastResult
  }

  if (running) {
    return { ok: true, skipped: true, changes: [], notifications, notified: notify, error: '上一次检测仍在进行' }
  }

  if (!force && Date.now() - lastCheckAt < cfg.interval * 1000) {
    return { ok: true, skipped: true, changes: [], notifications, notified: notify, error: '' }
  }

  running = true
  lastCheckAt = Date.now()

  /** 状态存储在 try 内初始化，保证构造客户端失败时也能走 finally 释放锁并落盘 */
  let state = null

  try {
    state = getStore()
    const client = new StatusClient(cfg)

    /** 1. 拉取数据 */
    let rawSnapshot
    try {
      rawSnapshot = await client.getSnapshot()
    } catch (error) {
      logger.debug(`[server-status] 面板请求失败：${error?.message || error}`)
      const result = await handleSourceFailure(cfg, state, error, client, notify)
      addPush(result.push)
      lastResult = {
        ok: false,
        skipped: false,
        changes: result.changes,
        notifications,
        notified: notify,
        error: error?.message || String(error)
      }
      return lastResult
    }

    /** 2. 面板恢复 */
    const recoverResult = await handleSourceRecover(cfg, state, client, notify)
    addPush(recoverResult.push)

    /** 3. 对比状态 */
    const snapshot = filterSnapshot(rawSnapshot, cfg)
    const { downItems, upItems, repeatItems } = evaluate(snapshot, cfg, state)

    /** 4. 推送 */
    const changes = [...recoverResult.changes]

    /** 事件与推送解耦：notify=false 时也要记录 changes，供调用方判断状态变化 */
    if (downItems.length > 0) {
      changes.push(...downItems.map((item) => ({ type: 'down', monitor: item.monitor.name, label: item.label })))
    }

    if (repeatItems.length > 0) {
      changes.push(...repeatItems.map((item) => ({ type: 'repeat', monitor: item.monitor.name })))
    }

    if (upItems.length > 0) {
      changes.push(...upItems.map((item) => ({ type: 'up', monitor: item.monitor.name })))
    }

    let image = null

    if (notify && (downItems.length > 0 || upItems.length > 0 || repeatItems.length > 0)) {
      image = await renderStatusImage(snapshot, cfg)

      if (downItems.length > 0) {
        addPush(await pushMessage(cfg, buildDownText(downItems, cfg), image))
      }

      if (repeatItems.length > 0) {
        addPush(await pushMessage(cfg, buildRepeatText(repeatItems, cfg), image))
      }

      if (upItems.length > 0) {
        addPush(await pushMessage(cfg, buildUpText(upItems, cfg), image))
      }
    }

    lastResult = { ok: true, skipped: false, changes, notifications, notified: notify, error: '' }

    if (changes.length > 0) {
      logger.info(`[server-status] 检测完成，产生 ${changes.length} 条事件：${changes.map((item) => item.type).join(', ')}`)
    }

    return { ...lastResult, snapshot }
  } catch (error) {
    logger.error(`[server-status] 检测异常：${error?.stack || error}`)
    lastResult = {
      ok: false,
      skipped: false,
      changes: [],
      notifications,
      notified: notify,
      error: error?.message || String(error)
    }
    return lastResult
  } finally {
    /** 无论成功、失败还是提前返回，都立即落盘并释放 running 锁 */
    if (state) state.flush()
    running = false
  }
}

/** 当前运行状态 */
export const getRuntime = () => ({
  running,
  lastCheckAt,
  lastResult
})
