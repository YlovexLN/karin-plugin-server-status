/**
 * Karin WebUI 配置声明
 *
 * Karin >= 1.16.1 会在插件配置页中用 iframe 加载 `page.url`；
 * 旧版本会忽略 `karin.web`，插件仍按 config.json 正常工作。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'node-karin'

const pluginDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)))
const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf-8'))

/** 本地前端开发时直接指向 Vite dev server */
const isLocalDevelopment = process.env.NODE_ENV === 'development'

export const webConfig = defineConfig({
  info: {
    id: pkg.name,
    name: '服务器状态监控',
    description: pkg.description,
    icon: {
      name: 'monitor_heart',
      color: '#0ea5e9'
    },
    version: pkg.version,
    author: [
      {
        name: 'YlovexLN',
        home: 'https://github.com/YlovexLN/karin-plugin-server-status/',
        avatar: 'https://github.com/YlovexLN.png'
      }
    ]
  },
  page: {
    url: isLocalDevelopment
      ? 'http://localhost:5176/server-status/assets/karin-config'
      : '/server-status/assets/karin-config',
    title: '服务器状态监控配置',
    description: '配置监控地址、推送目标、过滤规则与截图选项（本插件管理页面参考自 kkk 插件自带的配置管理页面）'
  }
})

export default webConfig
