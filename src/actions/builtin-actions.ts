/**
 * actions/builtin-actions — 内置键位动作表（TuiApp.handleKey 原 if 链的动作化）。
 *
 * 每条动作对应原 handleKey 的一段分支，相位（phase）对齐原分支的相对位置：
 * - early（overlay 委派之前）：空 Enter 工具卡、shift_tab 三态循环、ctrl_n/s/q、
 *   ctrl_p 命令面板、ctrl_. 快捷键面板、ctrl_f 历史搜索。
 * - main（阻塞上下文轮询之后）：esc 三连（打断 > 关 inspect > 双击 rewind 布防）、
 *   ctrl_c（打断/清空/双击退出）、ctrl_o 推理展开、editorKey 外部编辑器、
 *   ctrl_t 转向、ctrl_return 插队（cancel-and-send）、ctrl_v 粘贴。
 * - tail（slash 菜单与 inspect 上下文键之后）：空 Tab 命令菜单、Alt+Backspace
 *   删附件、↑↓ 排队取回/历史透传。
 * approval 域（y/p/t/a/n/f/esc）只经 approval 阻塞上下文轮询，不参与常规 match。
 *
 * run 只经 ActionContext 触达 TuiApp（装配件在 ui/app.ts）；本模块不 import app。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/actions/builtin-actions
 */

import type { KeyName } from '../engine/input-handler.js'
import { EXIT_WINDOW_MS, REWIND_DOUBLE_ESC_MS } from './registry.js'
import type { KeyAction } from './types.js'

/** createBuiltinActions 装配选项。 */
export interface BuiltinActionsOptions {
  /** 外部编辑器触发键（TuiAppOptions.editorKey；缺省 ctrl_e）。 */
  editorKey: KeyName
}

/**
 * 内置动作表（注册序即 match 优先级）。keymap 投影行序由 keymapOrder 承担
 * （10/20/130/160/180/190 留给 keymap-panel 的输入层静态补充行）。
 * @param options - 装配选项（editorKey）。
 * @returns 动作数组（喂 ActionRegistry）。
 */
export function createBuiltinActions(options: BuiltinActionsOptions): KeyAction[] {
  return [
    // ── early：overlay 委派之前（原分支位置保持——面板打开时这些键仍先生效） ──
    {
      // A5：空输入 Enter 切换最后一张进行中工具卡的展开/收起（非空时 Enter 是
      // 提交路径，不劫持；无进行中工具卡不消费，落给后续路由）。
      id: 'tool.toggle-latest',
      keys: [{ name: 'return' }],
      when: ctx => ctx.inputEmpty() && ctx.hasPendingToolCard(),
      phase: 'early',
      category: '工具',
      hint: '展开/收起最新工具卡',
      keymapHidden: true,
      run: ctx => { ctx.toggleLatestToolCard() },
    },
    {
      // C3 项 4：Shift+Tab 三态循环（Normal → Plan → Always-Approve → Normal）。
      id: 'mode.cycle',
      keys: [{ name: 'shift_tab' }],
      phase: 'early',
      category: '模式',
      hint: '模式循环 normal→plan→always-approve',
      keymapOrder: 150,
      run: ctx => { ctx.cycleMode() },
    },
    {
      // C4：欢迎页菜单入口快捷键——任意时刻可用（即 /session new 语义）。
      // 注意：ctrl_n 在此劫持 InputLine 的 historyNext，输入历史导航由 ↑/↓ 承担。
      id: 'session.new',
      keys: [{ name: 'ctrl_n' }],
      phase: 'early',
      category: '会话',
      hint: '新会话',
      keymapOrder: 30,
      run: ctx => { ctx.newSession() },
    },
    {
      id: 'session.restore',
      keys: [{ name: 'ctrl_s' }],
      phase: 'early',
      category: '会话',
      hint: '恢复最近会话',
      keymapOrder: 40,
      run: ctx => { ctx.restoreRecentSession() },
    },
    {
      id: 'app.quit',
      keys: [{ name: 'ctrl_q' }],
      phase: 'early',
      category: '会话',
      hint: '退出',
      keymapOrder: 50,
      run: ctx => { ctx.requestExit() },
    },
    {
      // Ctrl+P 命令面板：先于输入行（ctrl_p 原被 historyPrev 占用）。
      id: 'palette.toggle',
      keys: [{ name: 'ctrl_p' }],
      phase: 'early',
      category: '面板',
      hint: '命令面板',
      keymapOrder: 60,
      run: ctx => { ctx.togglePalette() },
    },
    {
      // Ctrl+. 快捷键面板（grok-build 同款键位清单；再按一次关闭）。
      id: 'keymap.toggle',
      keys: [{ name: 'ctrl_.' }],
      phase: 'early',
      category: '面板',
      hint: '快捷键面板',
      keymapOrder: 70,
      run: ctx => { ctx.toggleKeymap() },
    },
    {
      // C2 项 2：Ctrl+F 历史搜索 overlay。palette 打开时不拦截（palette 优先）。
      // Ctrl+R 是 InputLine 层的历史搜索键（不进本表），键位列一并标注。
      id: 'search.toggle',
      keys: [{ name: 'ctrl_f' }],
      when: ctx => !ctx.paletteOpen(),
      phase: 'early',
      category: '面板',
      hint: '历史搜索（n/N 跳转）',
      keysLabel: 'Ctrl+F / Ctrl+R',
      keymapOrder: 80,
      run: ctx => { ctx.toggleHistorySearch() },
    },

    // ── main：阻塞上下文轮询之后 ──
    {
      // Esc 打断：对齐 Claude Code 单次 Esc 停止输出；仅「无挂起交互 + running」。
      // slash 菜单打开时 Esc 归菜单（关闭菜单），不到此动作。
      id: 'session.abort',
      keys: [{ name: 'escape' }],
      when: ctx => !ctx.slashMenuOpen() && ctx.isRunning(),
      category: '会话',
      hint: '打断当前回合',
      keymapHidden: true, // Esc 合并行由 session.rewind 承担
      run: ctx => { ctx.abort() },
    },
    {
      // Esc 关闭检查类面板（/config /skills /status /lsp /tasks）；running 时已被
      // session.abort 抢先（注册序）。布防中的双击 rewind 窗口随之撤防。
      id: 'inspect.close',
      keys: [{ name: 'escape' }],
      when: ctx => !ctx.slashMenuOpen() && ctx.inspectAny(),
      category: '面板',
      hint: '关闭检查面板',
      keymapHidden: true,
      footerHint: 'esc 关闭',
      run: ctx => {
        ctx.inspectClose()
        ctx.confirmDisarm('session.rewind')
      },
    },
    {
      // 空闲双击 Esc（窗口内第二次）触发 rewind（CC 的 Esc+Esc 时间回溯）；
      // 第一次只布防并放行（返回 false 继续流向 InputLine——vim 等空闲 Esc
      // 语义保留），窗口过期后第二次仅刷新布防。vim normal 下 Esc 空操作：
      // 布防/触发都跳过（when 守卫）。
      id: 'session.rewind',
      keys: [{ name: 'escape' }],
      when: ctx => !ctx.slashMenuOpen() && !ctx.inspectAny() && !ctx.vimNormalEsc(),
      confirmMs: REWIND_DOUBLE_ESC_MS,
      category: '会话',
      hint: '取消/关闭检查面板（空闲双击 rewind）',
      keymapOrder: 200,
      run: ctx => {
        const now = Date.now()
        if (ctx.confirmWithin('session.rewind', now)) {
          ctx.confirmDisarm('session.rewind')
          ctx.rewindSession()
          return true
        }
        ctx.confirmArm('session.rewind', now)
        return false
      },
    },
    {
      // Ctrl+C 专用复合语义（原分支原样搬入）：Windows 防抖记录（markCtrlC
      // 供 SIGINT 双触发防护）→ 窗口内第二次恒退出 → running 打断并布防 →
      // 空输入布防（提示「再按 Ctrl+C 退出」）→ 草稿清空并布防 → 纯打断。
      id: 'app.interrupt',
      keys: [{ name: 'ctrl_c' }],
      confirmMs: EXIT_WINDOW_MS,
      category: '会话',
      hint: '打断当前回合（空闲双击退出）',
      keymapOrder: 140,
      run: ctx => {
        const now = Date.now()
        ctx.markCtrlC(now)
        // 窗口内第二次 Ctrl+C 恒退出（不要求空输入）：第一次（无论打断、清空
        // 还是布防提示）已表达退出意图，草稿/在途不再拦路（天枢 59d00152 语义）。
        if (ctx.hasExit && ctx.confirmWithin('app.interrupt', now)) {
          ctx.confirmDisarm('app.interrupt')
          ctx.requestExit()
          return
        }
        if (ctx.isRunning()) {
          ctx.abort()
          // 打断同时布防连按窗口（有草稿也布防）：agent 落定前第二次 Ctrl+C
          // 直接退出，不再要求等 agent 变 idle 后重按。
          if (ctx.hasExit) ctx.confirmArm('app.interrupt', now)
          else ctx.confirmDisarm('app.interrupt')
          ctx.flushLive()
          return
        }
        if (ctx.inputEmpty() && ctx.hasExit) {
          ctx.confirmArm('app.interrupt', now)
          ctx.flushLive()
          return
        }
        if (!ctx.inputEmpty()) {
          // 空闲草稿：清空输入行（shell 语义；setValue 记 undo，Ctrl+Z 可恢复）
          // 并布防连按窗口——第二次 Ctrl+C 即退出，无「已取消」噪音。
          ctx.clearInput()
          if (ctx.hasExit) ctx.confirmArm('app.interrupt', now)
          ctx.flushLive()
          return
        }
        ctx.confirmDisarm('app.interrupt')
        ctx.abort()
      },
    },
    {
      // 展开/收起最近推理块。无推理块时不消费（when 守卫）——落给 editorKey
      // 分支（恢复 opencode 的 ctrl+o=展开语义 与可配置编辑键的组合判定）。
      id: 'reasoning.toggle',
      keys: [{ name: 'ctrl_o' }],
      when: ctx => ctx.hasReasoning(),
      category: '面板',
      hint: '展开/收起推理块',
      keymapOrder: 90,
      run: ctx => { ctx.toggleReasoning() },
    },
    {
      // Phase 6.4：外部编辑器——当前输入行内容进 $EDITOR，保存退出后回填。
      id: 'editor.open',
      keys: [{ name: options.editorKey }],
      category: '输入',
      hint: '外部编辑器',
      keymapOrder: 100,
      run: ctx => { ctx.openExternalEditor() },
    },
    {
      // Ctrl+T 中轮转向：当前输入行作为转向提交（空输入 no-op），并清空输入行。
      id: 'input.steer',
      keys: [{ name: 'ctrl_t' }],
      category: '会话',
      hint: '中轮转向',
      keymapOrder: 110,
      run: ctx => { ctx.steerInput() },
    },
    {
      // Ctrl+Enter 插队（cancel-and-send）：running 且输入非空时打断当前回合
      //（cancel 带 keepInbox，宿主 inbox 未消费消息保留），落定后直发输入行
      // 草稿——与 Ctrl+T steer（不打断在途 step）互补。键位只在 kitty 键盘
      // 增强协议下可达（CSI 13;5u）：attach 按 caps 推送 flag 1，不支持的终端
      // 永不收到该序列（天然静默）；keymap 行按 caps 过滤（requiresKittyKeyboard）。
      id: 'input.cancel-and-send',
      keys: [{ name: 'ctrl_return' }],
      when: ctx => ctx.isRunning() && !ctx.inputEmpty(),
      category: '会话',
      hint: '打断并立即发送（插队）',
      keysLabel: 'Ctrl+Enter',
      keymapOrder: 115,
      requiresKittyKeyboard: true,
      run: ctx => { ctx.cancelAndSend() },
    },
    {
      // Ctrl+V：剪贴板图片粘贴（先于普通输入处理；无图时 fallback 剪贴板文本）。
      id: 'input.paste-image',
      keys: [{ name: 'ctrl_v' }],
      category: '输入',
      hint: '粘贴剪贴板图片/文本',
      keymapOrder: 120,
      run: ctx => { ctx.pasteClipboard() },
    },

    // ── tail：slash 菜单与 inspect 上下文键之后 ──
    {
      // 空输入框 Tab → 命令菜单（palette execute 模式，#31 参考 Claude Code）。
      // 非空 Tab 走 @ 补全（InputLine onTabComplete）；slash 菜单打开时 Tab 已被
      // 菜单分支拦截（接受补全）。
      id: 'palette.open-menu',
      keys: [{ name: 'tab' }],
      when: ctx => ctx.inputEmpty(),
      phase: 'tail',
      category: '面板',
      hint: '命令菜单',
      keymapHidden: true, // Tab 行由输入层静态行承担（@-路径补全 / 接受 slash 选中项）
      run: ctx => { ctx.openPaletteMenu() },
    },
    {
      // 空行 Alt+Backspace → 移除末张附件：有文本时 Alt+Backspace 仍是词删除
      //（空行上词删除本就是空操作，两职责零冲突）；📎 行同步更新。
      id: 'attachment.remove-last',
      keys: [{ name: 'backspace', meta: true }],
      when: ctx => ctx.inputEmpty() && ctx.hasImages(),
      phase: 'tail',
      category: '输入',
      hint: '移除末张附件',
      keymapHidden: true,
      run: ctx => { ctx.removeLastImage() },
    },
    {
      // 排队取回（对标 CC）：空输入 ↑ 取回队首回输入行。
      id: 'history.recall-queued',
      keys: [{ name: 'up' }],
      when: ctx => ctx.inputEmpty() && ctx.hasQueuedSubmits(),
      phase: 'tail',
      category: '输入',
      hint: '取回排队提交',
      keymapHidden: true,
      run: ctx => { ctx.recallQueuedSubmit() },
    },
    {
      // ↑↓ 交给 InputLine 的历史导航（InputLineEvent 'history' 不消费即已处理）。
      id: 'history.navigate',
      keys: [{ name: 'up' }, { name: 'down' }],
      phase: 'tail',
      category: '输入',
      hint: '输入历史（菜单打开时为选择；运行中排队时 ↑ 取回队首）',
      keysLabel: '↑/↓',
      keymapOrder: 170,
      run: (ctx, key) => { ctx.passHistoryKey(key) },
    },

    // ── approval 域：审批挂起时经 approval 阻塞上下文独占轮询（不进常规 match） ──
    // 注册序即决策梯度序（y → p → t → a → n → f → esc），footer 提示段与审批卡
    // 键位行同按此序投影（actions/projections 同源）。
    {
      id: 'approval.allow',
      keys: [{ char: 'y' }, { char: 'Y' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '允许一次',
      footerHint: 'y 允许',
      run: ctx => { ctx.settleApproval('allowed-once') },
    },
    {
      // 决策分层阶段 2：命令前缀级会话白名单——仅 bash 类工具且能提取命令首
      // token 时出现（when 守卫按挂起请求的缓存前缀判定）；比 t 整工具放行收敛。
      id: 'approval.allow-prefix',
      keys: [{ char: 'p' }, { char: 'P' }],
      when: ctx => ctx.approvalPending() && ctx.approvalCommandPrefix() !== null,
      context: 'approval',
      category: '工具',
      hint: '此命令前缀不再问',
      footerHint: 'p 此命令不再问',
      run: ctx => { ctx.approveCommandPrefix() },
    },
    {
      // 任务4a 工具级会话白名单：该工具本会话内后续请求自动放行，其他工具仍
      // 逐卡审批——比 a 全放行收敛，比每次 y 免重复决策。
      id: 'approval.allow-tool',
      keys: [{ char: 't' }, { char: 'T' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '本会话放行此工具',
      footerHint: 't 记住此工具',
      run: ctx => { ctx.approveToolSession() },
    },
    {
      // 本会话放行：先开 always-approve，再结算当前请求（与 Shift+Tab 进 auto
      // 不同——挂起中的这一张也立刻通过，而不是只影响后续请求）。
      id: 'approval.always',
      keys: [{ char: 'a' }, { char: 'A' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '本会话全部放行',
      footerHint: 'a 全放行',
      run: ctx => { ctx.approveAlways() },
    },
    {
      id: 'approval.reject',
      keys: [{ char: 'n' }, { char: 'N' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '拒绝',
      footerHint: 'n 拒绝',
      run: ctx => { ctx.settleApproval('rejected') },
    },
    {
      // 决策分层阶段 2：拒绝并说明——进反馈输入态（文本走输入行，Enter 提交时
      // settle rejected + steer 反馈文本；Esc 返回选项态不结算）。
      id: 'approval.reject-feedback',
      keys: [{ char: 'f' }, { char: 'F' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '拒绝并说明',
      footerHint: 'f 拒绝并说明',
      run: ctx => { ctx.startApprovalFeedback() },
    },
    {
      id: 'approval.cancel',
      keys: [{ name: 'escape' }, { name: 'ctrl_c' }],
      when: ctx => ctx.approvalPending(),
      context: 'approval',
      category: '工具',
      hint: '取消审批',
      footerHint: 'esc 取消',
      run: ctx => { ctx.settleApproval('cancelled') },
    },
  ]
}
