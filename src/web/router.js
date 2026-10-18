/**
 * WebUI 路由组装
 *
 * /server-status/v1/*     配置 API（Karin authMiddleware 鉴权）
 * /server-status/assets/* 前端静态资源 + SPA 兜底
 * /server-status/         跳转到完整应用页
 */

import express from 'node-karin/express'
import { authMiddleware } from 'node-karin'
import { apiRouter } from './api.js'
import { createStaticRouter } from './static.js'
import { APP_PAGE_PATH } from './paths.js'

export const createWebRouter = () => {
  const router = express.Router()

  router.use(express.json({ limit: '1mb' }))
  router.use(express.urlencoded({ extended: true }))

  router.use('/v1', authMiddleware, apiRouter)
  router.use('/assets', createStaticRouter())
  router.get('/', (_req, res) => res.redirect(APP_PAGE_PATH))

  return router
}
