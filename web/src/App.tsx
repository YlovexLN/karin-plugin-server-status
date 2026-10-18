import { Toast } from '@heroui/react'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { authChangedEventName, hasAuthToken } from './auth/token'
import { AboutPanel } from './components/AboutPanel'
import { ConfigPanel } from './components/ConfigPanel'
import { LoginPanel } from './components/LoginPanel'
import { ThemeProvider } from './hooks/useTheme'
import { DesktopLayout } from './layouts/DesktopLayout'
import { MobileLayout } from './layouts/MobileLayout'
import type { DeviceLayout } from './types'
import { detectDevice } from './utils/device'

const CONFIG_PATH = '/server-status/assets/config'
const CONFIG_EMBED_PATH = '/server-status/assets/karin-config'
const ABOUT_PATH = '/server-status/assets/about'

/** 根据设备类型挂载对应布局 */
const Shell = ({ device }: { device: DeviceLayout }) =>
  device === 'mobile' ? <MobileLayout /> : <DesktopLayout />

/** 嵌入 Karin iframe 时使用的纯配置页 */
const EmbeddedConfig = ({ device }: { device: DeviceLayout }) => (
  <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4">
    <ConfigPanel device={device} />
  </div>
)

const AppRoutes = ({ device }: { device: DeviceLayout }) => (
  <Routes>
    <Route path={CONFIG_EMBED_PATH} element={<EmbeddedConfig device={device} />} />
    <Route element={<Shell device={device} />}>
      <Route path={CONFIG_PATH} element={<ConfigPanel device={device} />} />
      <Route path={ABOUT_PATH} element={<AboutPanel />} />
    </Route>
    <Route path="/server-status/assets" element={<Navigate replace to={CONFIG_PATH} />} />
    <Route path="/server-status" element={<Navigate replace to={CONFIG_PATH} />} />
    <Route path="*" element={<Navigate replace to={CONFIG_PATH} />} />
  </Routes>
)

const App = () => {
  const [authenticated, setAuthenticated] = useState(() => hasAuthToken())
  const [device, setDevice] = useState<DeviceLayout>(() => detectDevice())

  useEffect(() => {
    const syncAuth = () => setAuthenticated(hasAuthToken())
    window.addEventListener(authChangedEventName, syncAuth)
    window.addEventListener('storage', syncAuth)

    return () => {
      window.removeEventListener(authChangedEventName, syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [])

  useEffect(() => {
    let frame = 0

    const syncDevice = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const next = detectDevice()
        setDevice((current) => (current === next ? current : next))
      })
    }

    window.addEventListener('resize', syncDevice)
    window.addEventListener('orientationchange', syncDevice)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', syncDevice)
      window.removeEventListener('orientationchange', syncDevice)
    }
  }, [])

  return (
    <ThemeProvider>
      <Toast.Provider placement="top" />
      {authenticated ? <AppRoutes device={device} /> : <LoginPanel onLogin={() => setAuthenticated(true)} />}
    </ThemeProvider>
  )
}

export default App

/** 根组件 */
export const Root = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
