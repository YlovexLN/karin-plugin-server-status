/** 格式化时间戳为本地时间 */
export const formatDateTime = (value?: number): string => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '—'
  }
}

/** 格式化相对时间 */
export const formatRelative = (value?: number): string => {
  if (!value) return '暂无记录'

  const diff = Date.now() - value
  if (diff < 0) return formatDateTime(value)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
