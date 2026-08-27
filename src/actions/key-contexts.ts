/**
 * actions/key-contexts — 阻塞态键上下文（question/btw/approval/inspect）统一接口。
 *
 * 原 handleKey 里四段「挂起中独占键盘」分支的收敛：各上下文暴露
 * { isActive(), handleKey(key): boolean }，TuiApp 按固定优先级轮询
 * （question > btw > approval 在 overlay 委派之后、主段动作之前；inspect
 * 在 slash 菜单之后——均为现状顺序保持）。返回 false = 放行给后续路由
 * （btw 只消费 Esc/Ctrl+C，其余键照常进输入行——现状语义）。
 *
 * 业务调用（settle/cancel/重绘）经 deps 闭包注入，本模块不 import app。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions/key-contexts
 */

import type { InputLine } from '../engine/input-line.js'
import type { InputController } from '../engine/input-controller.js'
import { SLASH_MENU_MAX_ROWS } from '../format/slash-menu.js'
import type { QuestionController } from '../controllers/question-controller.js'
import type { ApprovalController } from '../controllers/approval-controller.js'
import type { BtwController } from '../controllers/btw-controller.js'
import type { InspectSurfaceController } from '../controllers/inspect-surface.js'
import { inspectKeyAction } from '../ui/inspect-panels.js'
import type { ActionRegistry } from './registry.js'
import type { ActionContext, BlockingKeyContext } from './types.js'

/** createQuestionKeyContext 的依赖注入。 */
export interface QuestionKeyContextDeps {
  /** 挂起提问状态机。 */
  question: QuestionController
  /** plan-review 反馈模式的文本编辑面（反馈走输入行）。 */
  inputLine: Pick<InputLine, 'value' | 'setValue' | 'handleKey'>
  /** 结算挂起提问（TuiApp.settleQuestion 转发）。 */
  settle(answer: unknown): void
  /** 取消挂起提问（TuiApp.cancelQuestion 转发）。 */
  cancel(): void
  /** 请求重绘 live 区。 */
  flushLive(): void
}

/**
 * T3.1 结构化提问上下文：数字键选选项（1-based），Esc/Ctrl+C 取消；
 * plan-review 卡 f 键进入反馈输入模式（文本走 inputLine，Enter 提交）。
 * 挂起期间吞掉全部键（返回恒 true）。
 */
export function createQuestionKeyContext(deps: QuestionKeyContextDeps): BlockingKeyContext {
  return {
    id: 'question',
    isActive: () => deps.question.isPending,
    handleKey: (key) => {
      const peek = deps.question.peek()
      const item = peek?.request.questions[0]
      if (deps.question.feedbackMode) {
        if (key.name === 'return') {
          const feedback = deps.inputLine.value
          deps.inputLine.setValue('')
          // 反馈路径选择「非 approve 的选项」（plan-mode 按 selected !== approve
          // + custom 判定 keep-planning；label 从 options 推导，不硬编码）。
          const keepLabel = item?.options?.find(o => o.label !== item.intent?.approve)?.label
            ?? item?.options?.[0]?.label ?? ''
          deps.settle({ answers: [{ id: item?.id ?? '', selected: [keepLabel], custom: feedback }] })
        } else if (key.name === 'escape' || key.name === 'ctrl_c') {
          deps.question.setFeedbackMode(false)
          deps.flushLive()
        } else {
          deps.inputLine.handleKey(key.name, key.char, key.ctrl, key.meta, key.shift, key.inline === true)
          deps.flushLive()
        }
      } else if (key.name === 'escape' || key.name === 'ctrl_c') {
        deps.cancel()
      } else if (item !== undefined && item.intent?.kind === 'plan-review' && (key.char === 'f' || key.char === 'F')) {
        deps.question.setFeedbackMode(true)
        deps.inputLine.setValue('')
        deps.flushLive()
      } else if (item !== undefined && item.options !== undefined && /^[0-9]$/.test(key.char)) {
        const idx = Number(key.char) - 1
        const option = item.options[idx]
        if (option !== undefined) {
          deps.settle({ answers: [{ id: item.id, selected: [option.label] }] })
        }
      }
      return true
    },
  }
}

/** createBtwKeyContext 的依赖注入。 */
export interface BtwKeyContextDeps {
  /** /btw 侧问状态机。 */
  btw: Pick<BtwController, 'isActive' | 'dismiss'>
  /** 请求重绘 live 区。 */
  flushLive(): void
}

/**
 * P1 /btw 侧问上下文：Esc/Ctrl+C 关闭（done 折叠答案入 scrollback；loading
 * 取消并销毁 btw agent；error 直接清除）。其余键放行（返回 false）——
 * 侧问不抢占输入焦点（现状语义）。
 */
export function createBtwKeyContext(deps: BtwKeyContextDeps): BlockingKeyContext {
  return {
    id: 'btw',
    isActive: () => deps.btw.isActive,
    handleKey: (key) => {
      if (key.name !== 'escape' && key.name !== 'ctrl_c') return false
      deps.btw.dismiss()
      deps.flushLive()
      return true
    },
  }
}

/** createApprovalKeyContext 的依赖注入。 */
export interface ApprovalKeyContextDeps {
  /** 审批挂起状态机。 */
  approval: Pick<ApprovalController, 'isPending'>
  /** 动作注册表（approval 域动作的 match 入口）。 */
  registry: ActionRegistry
  /** 动作执行上下文（approval 域动作的 run 参数）。 */
  ctx: ActionContext
}

/**
 * Phase 8 审批上下文：y/N/a/t 决定、Ctrl+C/Esc 取消——具体键位收敛在
 * registry 的 approval 域动作（与 footer 提示段同源）；未匹配的键一律吞掉
 * （不干扰输入行——现状语义）。
 */
export function createApprovalKeyContext(deps: ApprovalKeyContextDeps): BlockingKeyContext {
  return {
    id: 'approval',
    isActive: () => deps.approval.isPending,
    handleKey: (key) => {
      const action = deps.registry.match(key, deps.ctx, { context: 'approval' })
      if (action !== null) action.run(deps.ctx, key)
      return true
    },
  }
}

/** createSlashMenuKeyContext 的依赖注入。 */
export interface SlashMenuKeyContextDeps {
  /** 输入状态控制器（slashMenu 状态 + 导航/滚动/关闭）。 */
  inputController: Pick<InputController, 'slashMenu' | 'moveSlashSelection' | 'scrollSlashSelection' | 'closeSlash'>
  /** 接受 slash 菜单当前选中项（TuiApp.acceptSlashCompletion 转发）。 */
  accept(opts?: { submit?: boolean }): void
  /** 请求重绘 live 区。 */
  flushLive(): void
}

/**
 * slash 命令菜单上下文（grok slash_dropdown 键路由对齐）：↑↓ 移动、
 * PageUp/PageDown 翻页、Tab 接受补全、Enter 接受并提交、Esc 关闭。
 * 菜单打开时未命中键放行（false——字符照常进输入行驱动过滤）。
 * 注：Ctrl+P/N 已被命令面板/新会话全局动作占用，不在此列。
 */
export function createSlashMenuKeyContext(deps: SlashMenuKeyContextDeps): BlockingKeyContext {
  return {
    id: 'slash-menu',
    isActive: () => deps.inputController.slashMenu.open,
    handleKey: (key) => {
      if (key.name === 'up' || key.name === 'down') {
        deps.inputController.moveSlashSelection(key.name === 'up' ? -1 : 1)
        deps.flushLive()
        return true
      }
      if (key.name === 'pageup' || key.name === 'pagedown') {
        deps.inputController.scrollSlashSelection(key.name === 'pageup' ? -SLASH_MENU_MAX_ROWS : SLASH_MENU_MAX_ROWS)
        deps.flushLive()
        return true
      }
      if (key.name === 'tab') {
        deps.accept()
        return true
      }
      if (key.name === 'return') {
        deps.accept({ submit: true })
        return true
      }
      if (key.name === 'escape') {
        deps.inputController.closeSlash()
        deps.flushLive()
        return true
      }
      return false
    },
  }
}

/** createInspectKeyContext 的依赖注入。 */
export interface InspectKeyContextDeps {
  /** 检查类面板控制器（/config /skills /status /lsp /tasks）。 */
  inspect: InspectSurfaceController
  /** 空输入与 vim 态读取（inspectKeyAction 的判定输入）。 */
  inputLine: Pick<InputLine, 'value' | 'vimMode'>
}

/**
 * 检查类面板上下文键：/config n 通知、d 密度；/skills j/k 移动选中。
 * Esc 关闭不在此列——归 session.abort/inspect.close 主段动作（注册序保持）。
 * 未命中返回 false 放行（现状：inspectKeyAction null → 继续路由）。
 */
export function createInspectKeyContext(deps: InspectKeyContextDeps): BlockingKeyContext {
  return {
    id: 'inspect',
    isActive: () => deps.inspect.any(),
    handleKey: (key) => {
      const act = inspectKeyAction({
        name: key.name,
        char: key.char,
        empty: deps.inputLine.value === '',
        vimInsert: deps.inputLine.vimMode === 'insert',
        flags: deps.inspect.flags(),
      })
      if (act === null || act.type === 'close') return false
      deps.inspect.dispatch(act)
      return true
    },
  }
}
