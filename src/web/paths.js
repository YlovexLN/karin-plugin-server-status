/**
 * WebUI 路径常量
 *
 * 单独拆出来是为了避免 index / router / static 之间循环 import。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件包绝对路径 */
export const pluginDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

/** 前端构建产物目录 */
export const webDistDir = path.join(pluginDir, 'web-dist')

/** WebUI 在 Karin 主路由下的挂载前缀 */
export const WEB_PREFIX = '/server-status'

/** 配置页（Karin iframe 使用） */
export const CONFIG_PAGE_PATH = `${WEB_PREFIX}/assets/karin-config`

/** 完整应用页（浏览器直接打开使用） */
export const APP_PAGE_PATH = `${WEB_PREFIX}/assets/config`
