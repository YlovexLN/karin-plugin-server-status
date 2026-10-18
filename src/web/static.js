/**
 * WebUI 静态资源路由
 *
 * - 构建产物从 `web-dist/` 读取；
 * - 未命中的 GET/HEAD 请求回退到 index.html，交给前端路由；
 * - 统一 no-cache，确保升级后不会继续用旧 index.html（hash 资源也走同一策略）。
 */

import fs from 'node:fs'
import path from 'node:path'
import express from 'node-karin/express'
import { logger } from 'node-karin'
import { webDistDir } from './paths.js'

const indexPath = path.join(webDistDir, 'index.html')

/** 发送 index.html；未构建时返回可读提示 */
const sendIndex = (res) => {
  if (!fs.existsSync(indexPath)) {
    res.status(503).type('text/plain; charset=utf-8').send(
      'WebUI 尚未构建：请在插件目录执行 pnpm install && pnpm build:web，然后重启 Karin。'
    )
    return
  }

  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(indexPath)
}

export const createStaticRouter = () => {
  const router = express.Router()

  if (fs.existsSync(webDistDir)) {
    router.use(express.static(webDistDir, {
      index: false,
      redirect: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache')
          return
        }
        res.setHeader('Cache-Control', 'no-cache')
      }
    }))
  } else {
    logger.warn(`[server-status] 未找到 WebUI 构建产物：${webDistDir}`)
  }

  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    sendIndex(res)
  })

  return router
}
