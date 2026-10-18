/**
 * node-karin/express 桩（仅用于本地集成测试）
 *
 * 只实现插件在导入期用到的最小 API：Router / json / urlencoded / static。
 * 集成测试不通过 HTTP 访问 WebUI，路由匹配逻辑由 test/test-integration.mjs 直接断言。
 */

const createLayer = (method, path, handlers) => ({ method, path, handlers })

const createRouter = () => {
  const layers = []

  /** 让 router 本身可作为中间件被 use 挂载 */
  const router = (_req, _res, next) => (typeof next === 'function' ? next() : undefined)

  router.__layers = layers

  router.use = (pathOrHandler, ...rest) => {
    if (typeof pathOrHandler === 'function') {
      layers.push(createLayer('use', '/', [pathOrHandler, ...rest]))
    } else {
      layers.push(createLayer('use', pathOrHandler, rest))
    }
    return router
  }

  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
    router[method] = (path, ...handlers) => {
      layers.push(createLayer(method, path, handlers))
      return router
    }
  }

  return router
}

const express = () => createRouter()

express.Router = createRouter
express.json = () => (_req, _res, next) => next?.()
express.urlencoded = () => (_req, _res, next) => next?.()
express.static = () => (_req, _res, next) => next?.()

export default express
export { createRouter }
