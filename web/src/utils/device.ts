import type { DeviceLayout } from '../types'

export const mobilePageWidthBreakpoint = 768

/** 获取当前页面可视宽度 */
export const getPageWidth = (): number => {
  return document.documentElement.clientWidth || window.innerWidth
}

/** 根据页面宽度判断布局类型 */
export const detectDeviceByPageWidth = (pageWidth: number = getPageWidth()): DeviceLayout => {
  return pageWidth <= mobilePageWidthBreakpoint ? 'mobile' : 'desktop'
}

/** 根据 User-Agent 判断是否倾向移动设备 */
export const hasMobileUserAgent = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  const mobileKeywords = ['android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone', 'mobile']
  return mobileKeywords.some((keyword) => userAgent.includes(keyword))
}

/** 检测当前设备类型：UA 或宽度任意命中手机条件即使用手机布局 */
export const detectDevice = (): DeviceLayout => {
  if (hasMobileUserAgent() || detectDeviceByPageWidth() === 'mobile') return 'mobile'
  return 'desktop'
}
