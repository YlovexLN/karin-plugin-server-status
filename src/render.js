/**
 * 状态图渲染
 *
 * 使用 Karin 的渲染器（推荐安装 @karinjs/plugin-puppeteer）把 HTML 截图成图片。
 * 未安装渲染器或渲染失败时返回 null，由调用方降级为文本报告。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { render, logger, karinPathHtml } from 'node-karin'
import { buildMonitorHtml, buildStatusHtml } from './template.js'

/** 是否已经提示过渲染器缺失 */
let warned = false

/**
 * HTML 字符串转 base64 图片
 * @param {string} html HTML 内容
 * @param {{ width: number, deviceScaleFactor: number }} cfg 配置
 * @returns {Promise<string>} base64（不含 data: 前缀）
 */
const renderHtmlToBase64 = async (html, cfg) => {
  const file = path.join(
    karinPathHtml,
    `server-status-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`
  )

  await fs.mkdir(karinPathHtml, { recursive: true })
  await fs.writeFile(file, html, 'utf-8')

  /**
   * 模板里 body 有 28px 内边距、卡片宽度为 cfg.width，
   * 所以视窗宽度需要额外加上左右内边距，否则截图右侧会被裁掉。
   */
  const viewportWidth = cfg.width + 56

  try {
    const result = await render.render({
      file,
      name: 'server-status',
      type: 'png',
      encoding: 'base64',
      fullPage: true,
      setViewport: {
        width: viewportWidth,
        height: 900,
        deviceScaleFactor: cfg.deviceScaleFactor
      },
      pageGotoParams: {
        waitUntil: 'networkidle2',
        timeout: 20000
      }
    })

    if (Array.isArray(result)) return result[0]
    return result
  } finally {
    fs.unlink(file).catch(() => {})
  }
}

/**
 * 渲染整页状态图
 * @param {any} snapshot 快照
 * @param {any} cfg 配置
 * @returns {Promise<string|null>} base64 或 null
 */
export const renderStatusImage = async (snapshot, cfg) => {
  if (!cfg.enableImage) return null

  try {
    return await renderHtmlToBase64(buildStatusHtml(snapshot, cfg), cfg)
  } catch (error) {
    if (!warned) {
      warned = true
      logger.warn(
        '[server-status] 状态图渲染失败，将降级为文本报告。' +
        '如需图片请安装渲染器插件：pnpm add @karinjs/plugin-puppeteer -w'
      )
      logger.warn(`[server-status] 渲染错误：${error?.message || error}`)
    } else {
      logger.debug(`[server-status] 渲染失败：${error?.message || error}`)
    }
    return null
  }
}

/**
 * 渲染单个监控项详情图
 * @param {any} monitor 监控项
 * @param {any} snapshot 快照
 * @param {any} cfg 配置
 * @returns {Promise<string|null>} base64 或 null
 */
export const renderMonitorImage = async (monitor, snapshot, cfg) => {
  if (!cfg.enableImage) return null

  try {
    return await renderHtmlToBase64(buildMonitorHtml(monitor, snapshot, cfg), cfg)
  } catch (error) {
    logger.debug(`[server-status] 详情图渲染失败：${error?.message || error}`)
    return null
  }
}
