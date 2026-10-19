import { authClient } from './client'
import type { ApiResponse, Config, ConfigPayload, MonitorListPayload, PushResult, StatePayload } from '../types'

const API_BASE = '/server-status/v1'

/** 解析 Karin 统一响应，失败时抛出后端 message */
const unwrap = <T>(response: ApiResponse<T>, fallback: string): T => {
  if (response.code === 200 && response.data !== undefined) return response.data
  throw new Error(response.message || fallback)
}

/** 获取当前配置 */
export const getConfig = async (): Promise<ConfigPayload> => {
  const response = await authClient.get<ApiResponse<ConfigPayload>>(`${API_BASE}/config`)
  return unwrap(response.data, '获取配置失败')
}

/** 保存配置，返回后端归一化后的完整配置 */
export const saveConfig = async (config: Config): Promise<Config> => {
  const response = await authClient.post<ApiResponse<{ config: Config }>>(`${API_BASE}/config`, { config })
  return unwrap(response.data, '保存配置失败').config
}

/** 获取 state.json 概览 */
export const getState = async (): Promise<StatePayload> => {
  const response = await authClient.get<ApiResponse<StatePayload>>(`${API_BASE}/state`)
  return unwrap(response.data, '获取状态失败')
}

/** 发送测试推送 */
export const testPush = async (): Promise<PushResult> => {
  const response = await authClient.post<ApiResponse<PushResult>>(`${API_BASE}/test-push`)
  return unwrap(response.data, '测试推送失败')
}

/**
 * 拉取可监控的监控项列表
 * - 传入表单里**尚未保存**的连接信息，方便先填密钥再拉列表
 */
export const fetchMonitors = async (
  options: Pick<Config, 'statusUrl' | 'statusSlug' | 'metricsUrl' | 'metricsApiKey' | 'metricsApiUser'>
): Promise<MonitorListPayload> => {
  const response = await authClient.post<ApiResponse<MonitorListPayload>>(`${API_BASE}/monitors`, options)
  return unwrap(response.data, '拉取监控项列表失败')
}
