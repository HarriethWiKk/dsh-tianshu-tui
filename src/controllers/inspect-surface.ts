/**
 * InspectSurfaceController — 检查类 live 面板（/config /skills /status /lsp /tasks）
 * 互斥开闭与键分发。监控类面板不在此列。
 *
 * @module @huiliyi37/dsh-tianshu-tui/controllers/inspect-surface
 */

import {
  anyInspectOpen,
  exclusiveInspect,
  type InspectKeyAction,
  type InspectPanel,
  type InspectPanelFlags,
} from '../ui/inspect-panels.js'

const WARN = {
  skills: '⚠ skills 服务不可用（未装配 skill 插件），技能面板无数据',
  status: '⚠ sessionProjections 服务不可用（未装配 session-projection 插件），目标/任务/计划投影段无数据（会话汇总段为本地投影，不受影响）',
  tasks: '⚠ sessionProjections 服务不可用（未装配 session-projection 插件），任务窗格无数据',
} as const

export interface InspectSurfaceOptions {
  hasService: (name: string) => boolean
  echoWarn: (text: string, hint?: string) => void
  refreshConfig: () => Promise<void>
  refreshSkills: () => void
  ensureLsp: () => void
  schedule: () => void
  flush: () => void
  toggleNotify: () => void
  toggleDensity: () => void
  moveSkills: (delta: -1 | 1) => boolean
}

/** 五项检查面板的显隐与打开副作用。 */
export class InspectSurfaceController {
  private state: InspectPanelFlags = {
    config: false, skills: false, status: false, lsp: false, tasks: false,
  }

  constructor(private readonly opts: InspectSurfaceOptions) {}

  flags(): InspectPanelFlags { return this.state }
  is(which: InspectPanel): boolean { return this.state[which] }
  any(): boolean { return anyInspectOpen(this.state) }

  close(): void {
    this.state = exclusiveInspect('config', false)
  }

  hide(which: InspectPanel): void {
    this.state = { ...this.state, [which]: false }
  }

  async toggle(which: InspectPanel): Promise<void> {
    const next = exclusiveInspect(which, !this.state[which])
    this.state = next
    if (next.config) await this.opts.refreshConfig()
    if (next.skills) {
      if (!this.opts.hasService('skills')) this.opts.echoWarn(WARN.skills, '/doctor 体检')
      this.opts.refreshSkills()
    }
    if (next.lsp) this.opts.ensureLsp()
    if (next.status && !this.opts.hasService('sessionProjections')) this.opts.echoWarn(WARN.status, '/doctor 体检')
    if (next.tasks && !this.opts.hasService('sessionProjections')) this.opts.echoWarn(WARN.tasks, '/doctor 体检')
    this.opts.schedule()
  }

  dispatch(act: InspectKeyAction): void {
    if (act.type === 'close') { this.close(); this.opts.flush(); return }
    if (act.type === 'notify') { this.opts.toggleNotify(); return }
    if (act.type === 'density') { this.opts.toggleDensity(); this.opts.flush(); return }
    if (act.type === 'skills-move' && this.opts.moveSkills(act.delta)) this.opts.schedule()
  }
}
