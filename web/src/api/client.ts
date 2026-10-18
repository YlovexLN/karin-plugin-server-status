import axios from 'axios'
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'

import { sha256 } from '../auth/crypto'
import { clearAuthTokens, getAccessToken, getRefreshToken, getUserId, setAccessToken, setAuthTokens } from '../auth/token'
import type { ApiResponse } from '../types'

interface LoginTokens {
  userId: string
  accessToken: string
  refreshToken: string
}

const karinApiBase = '/api/v1'

let refreshPromise: Promise<boolean> | null = null

/** 使用 Karin refresh token 静默刷新 access token */
const refreshAccessToken = async (): Promise<boolean> => {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const accessToken = getAccessToken()
    const refreshToken = getRefreshToken()
    if (!accessToken || !refreshToken) return false

    try {
      const response = await axios.post<ApiResponse<{ accessToken: string }>>(`${karinApiBase}/refresh`, {
        accessToken,
        refreshToken
      })
      const nextToken = response.data?.data?.accessToken
      if (!nextToken) return false
      setAccessToken(nextToken)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/** 带 Karin 登录态的 axios 实例 */
export const authClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

authClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  const userId = getUserId()

  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  if (userId) config.headers.set('x-user-id', userId)

  return config
})

authClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const config = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
    const status = error.response?.status

    if (config && !config._retry && (status === 401 || status === 419)) {
      config._retry = true
      const refreshed = await refreshAccessToken()
      if (refreshed) return authClient(config)
    }

    if (status === 401 || status === 419 || status === 420) {
      clearAuthTokens()
    }

    const message = error.response?.data?.message || error.message || '请求失败'
    throw new Error(message)
  }
)

/** 使用 Karin HTTP_AUTH_KEY 登录，并写入 Karin 主 Web 相同的 localStorage key */
export const loginWithAuthKey = async (authKey: string) => {
  const authorization = await sha256(authKey)
  const response = await axios.post<ApiResponse<LoginTokens>>(
    `${karinApiBase}/login`,
    { authorization },
    { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
  )

  const tokens = response.data?.data
  if (!tokens?.accessToken || !tokens.userId || !tokens.refreshToken) {
    throw new Error(response.data?.message || '登录失败')
  }

  setAuthTokens(tokens)
}
