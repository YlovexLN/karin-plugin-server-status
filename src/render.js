/**
 * 状态图渲染
 *
 * 使用 Karin 的渲染器（推荐安装 @karinjs/plugin-puppeteer）把 HTML 截图成图片。
 * 未安装渲染器或渲染失败时返回 null，由调用方降级为文本报告。
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { render, logger, karinPathHtml } from 'node-karin'
import { buildMonitorHtml, buildStatusHtml, FONT_FAMILY } from './template.js'

/** 是否已经提示过渲染器缺失 */
let warned = false

/**
 * 视窗高度的起始值
 *
 * `fullPage: true` 只会把视窗**向上**扩展到内容高度，不会收缩到比它更矮，
 * 所以这个值就是输出图片高度的下限：写大了，内容不足的页面（例如只有一张卡片
 * 的详情图）会在底部留出一条等高的空白。
 * 取一个远小于任何真实内容的值，让高度完全由内容决定。
 * 模板里没有 `vh` / `vw` 单位，改小不会影响排版。
 */
const VIEWPORT_MIN_HEIGHT = 100

/**
 * 内置中文字体的目录
 *
 * 插件自带一份 Noto Sans SC 子集（GB2312 + 拉丁），用于在没装中文字体的
 * Linux / Docker 环境里正常渲染汉字，避免截图出现方块。
 */
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts')

/**
 * 内置字体清单
 *
 * `weight` 与 CSS 的 `font-weight` 对应；模板只用到 400（正文）与 700（标题 / 徽章）。
 */
const FONT_FACES = [
  { file: 'NotoSansSC-Regular.woff2', weight: 400 },
  { file: 'NotoSansSC-Bold.woff2', weight: 700 }
]

/** 内置字体族名，与 `template.js` 的字体栈保持一致 */
export { FONT_FAMILY }

/**
 * 生成 `@font-face` 样式
 *
 * 字体文件与 HTML 临时文件不在同一目录，且 HTML 以 `file://` 打开，
 * 因此这里用 `pathToFileURL()` 生成绝对 `file://` 地址（能正确处理盘符、
 * 空格与非 ASCII 路径）。字体缺失时返回空串，让模板回退到系统字体栈，
 * 绝不能因为少一个字体文件就渲染失败。
 * @returns {string} `<style>` 片段或空串
 */
const buildFontStyle = () => {
  const faces = []

  for (const { file, weight } of FONT_FACES) {
    const target = path.join(FONT_DIR, file)
    if (!existsSync(target)) continue
    const url = pathToFileURL(target).href
    faces.push(
      `@font-face { font-family: "${FONT_FAMILY}"; font-style: normal; font-weight: ${weight}; ` +
      `font-display: block; src: url("${url}") format("woff2"); }`
    )
  }

  if (!faces.length) return ''
  return `<style>${faces.join('\n')}</style>`
}

/**
 * 把字体样式注入 HTML
 *
 * 插在 `</head>` 之前，确保先于页面其余样式生效；找不到 `</head>` 时原样返回。
 * @param {string} html 原始 HTML
 * @returns {string} 注入后的 HTML
 */
const injectFontStyle = (html) => {
  const style = buildFontStyle()
  if (!style) return html

  const at = html.indexOf('</head>')
  if (at === -1) return html
  return `${html.slice(0, at)}${style}\n${html.slice(at)}`
}

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
  await fs.writeFile(file, injectFontStyle(html), 'utf-8')

  /**
   * 模板里 body 有 28px 内边距、卡片宽度为 cfg.width，
   * 所以视窗宽度需要额外加上左右内边距，否则截图右侧会被裁掉。
   * 高度取 `VIEWPORT_MIN_HEIGHT`，由 fullPage 按内容撑开。
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
        height: VIEWPORT_MIN_HEIGHT,
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
