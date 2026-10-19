import { Button } from '@heroui/react'
import { ExternalLink, Info, Menu, Server, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { ThemeToggle } from '../components/ThemeToggle'
import { AUTHOR_HOME, AUTHOR_NAME, KKK_REPO, PLUGIN_REPO } from '../references'

const navItems = [
  { key: 'config', label: '配置管理', to: '/server-status/assets/config', icon: Settings },
  { key: 'about', label: '关于插件', to: '/server-status/assets/about', icon: Info }
] as const

/** 手机端布局：顶栏 + 抽屉导航 */
export const MobileLayout = () => {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const active = location.pathname.endsWith('/about') ? 'about' : 'config'

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-default-100 px-3">
        <Button isIconOnly aria-label="打开菜单" variant="secondary" onPress={() => setOpen(true)}>
          <Menu className="size-4" aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Server className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="truncate text-sm font-semibold">服务器状态监控</p>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/40" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-72 flex-col bg-background p-4 shadow-2xl"
            role="dialog"
            aria-label="导航菜单"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">导航</p>
              <Button isIconOnly aria-label="关闭菜单" variant="tertiary" onPress={() => setOpen(false)}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const selected = active === item.key
                return (
                  <button
                    key={item.key}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                      selected ? 'bg-primary/10 font-medium text-primary' : 'text-default-600 hover:bg-content2'
                    }`}
                    type="button"
                    onClick={() => go(item.to)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            <p className="mt-auto text-[11px] text-default-400">配置保存后即时生效 · GPL-3.0-only</p>
            <p className="mt-1 text-[11px] text-default-400">
              作者{' '}
              <a
                className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                href={AUTHOR_HOME}
                target="_blank"
                rel="noreferrer noopener"
              >
                {AUTHOR_NAME}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </p>
            <a
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-default-400 transition-colors hover:text-primary"
              href={PLUGIN_REPO}
              target="_blank"
              rel="noreferrer noopener"
            >
              插件仓库
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <a
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-default-400 transition-colors hover:text-primary"
              href={KKK_REPO}
              target="_blank"
              rel="noreferrer noopener"
            >
              参考 kkk · 鸣谢
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
