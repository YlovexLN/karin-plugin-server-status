import { ExternalLink, Info, Server, Settings } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { ThemeToggle } from '../components/ThemeToggle'
import { AUTHOR_HOME, AUTHOR_NAME, KKK_REPO, PLUGIN_REPO } from '../references'

const navItems = [
  { key: 'config', label: '配置管理', to: '/server-status/assets/config', icon: Settings },
  { key: 'about', label: '关于插件', to: '/server-status/assets/about', icon: Info }
] as const

/** 桌面端布局：侧边栏 + 顶栏 + 主内容 */
export const DesktopLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const active = location.pathname.endsWith('/about') ? 'about' : 'config'

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-default-100">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Server className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">服务器状态监控</p>
            <p className="truncate text-[11px] text-default-400">Karin Plugin</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const selected = active === item.key
            return (
              <button
                key={item.key}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  selected ? 'bg-primary/10 font-medium text-primary' : 'text-default-600 hover:bg-content2'
                }`}
                type="button"
                onClick={() => navigate(item.to)}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto border-t border-default-100 p-4 text-[11px] leading-relaxed text-default-400">
          <p>配置保存后即时生效</p>
          <p className="mt-0.5">
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
          <p className="mt-0.5">
            <a
              className="inline-flex items-center gap-1 transition-colors hover:text-primary"
              href={PLUGIN_REPO}
              target="_blank"
              rel="noreferrer noopener"
            >
              插件仓库
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </p>
          <a
            className="mt-0.5 inline-flex items-center gap-1 transition-colors hover:text-primary"
            href={KKK_REPO}
            target="_blank"
            rel="noreferrer noopener"
          >
            参考 kkk · 鸣谢
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <p className="mt-0.5">GPL-3.0-only</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-default-100 px-6">
          <div>
            <p className="text-sm font-semibold">{active === 'about' ? '关于插件' : '配置管理'}</p>
            <p className="text-[11px] text-default-400">
              {active === 'about' ? '插件能力、数据位置与鸣谢' : '监控、推送、过滤与截图'}
            </p>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
