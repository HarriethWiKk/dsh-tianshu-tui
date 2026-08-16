# 双击 Esc 触发 rewind + rewind 界面优化实施计划

日期:2026-08-16
依据:用户需求(对齐 Claude Code)+ [claude-howto checkpoints 文档](https://github.com/luongnv89/claude-howto/blob/main/zh/08-checkpoints/README.md)
(双击 Esc 打开 checkpoint 浏览器;列表带时间戳/文件/消息数;rewind 选项菜单)。

## 一、双击 Esc 触发 rewind(app.ts)

Esc 语义升级(与 Ctrl+C 双击退出同款计时模式):

| 状态 | Esc 行为 |
|---|---|
| overlay/菜单/提问/审批/btw 挂起 | 关闭/取消(现有分支,优先) |
| running | 单次打断(已实现,保持) |
| 空闲:窗口内第二次 Esc | **打开 rewind overlay**(rewindSession()) |
| 空闲:第一次 Esc | 记时间戳,静默;**不 return**(vim 等后续语义保留) |

- 新状态 `escRewindPendingSince`;handleKey 开头按非 Esc 键重置(与 ctrlCPendingSince
  同模式,L2652)。
- 双击窗口:`REWIND_DOUBLE_ESC_MS = 1000`(双击节奏;Ctrl+C 退出的 2s 窗口偏长,
  rewind 是高频操作,1s 更跟手)。独立常量,不蹭 EXIT_WINDOW_MS。
- 第一次 Esc 静默无提示;窗口过期(超 1s 的第二次)只刷新时间戳,不触发。

## 二、rewind 界面优化(rewind-overlay.ts,参考 CC checkpoint 浏览器)

`RewindableMessage` 加 `kind: 'user' | 'assistant'` 与 `time: number`(transcript
消息已有这两字段;现有测试 fixture 补齐)。

list 阶段渲染升级(保留两阶段状态机与执行/结果):

1. **turn 分隔线**:turn 变化时输出 dim `── turn N ──`(回合边界可视化)
2. **类型标记**:user `❯`(userColor)/ assistant `✦`(assistantColor)
3. **相对时间**:`3m 前`(复用 formatElapsedHuman;now 由渲染时注入?——render
   无 now 参数,用 Date.now(),纯函数层允许注入?rewind-overlay 是类,render
   内部 Date.now() 与现有 done 阶段一致,可测性靠 mock timers 或接受)
   ——设计:渲染行 `[2m 前]` 样式,时间取 `Date.now() - m.time`。
4. **滚动窗口**:选中超出可视区时窗口跟随(现 slice(-bodyHeight) 固定末尾,
   无法滚到更早消息)——改为 picker/command-palette 同款跟随窗口。
5. 选中行语义:footer 提示改「↑↓/j k 选择 · Enter 回退到此处 · Esc 取消」。

mode 阶段:保留 1/2/3 三粒度(convo/code/both)。CC 有 5 选项(含 summarize),
我们的 compact 走 harness 服务,不加 summarize(超范围)。

## 三、测试

- rewind-overlay.spec:fixture 补 kind/time;新断言(turn 分隔/类型标记/相对时间/
  滚动窗口跟随——消息数超 bodyHeight 时选中滚动)
- app.spec:空闲双击 Esc(两次 `\x1b`,间隔 <1s)→ rewind overlay 激活(渲染含
  'rewind');单次 Esc 不打开;窗口外(>1s)第二次不打开;running 单次 Esc 打断
  不回归(现有测试)

## 四、docs

interaction 中英:快捷键表加「Esc+Esc(空闲)回退」;交互面板段补 rewind 界面说明。

## 五、验证与提交

typecheck + 全量 npm test;SOURCE-MAP 无需改(无新文件)。
提交:feat(ui): 双击 Esc 触发 rewind + rewind 时间线界面(参考 Claude Code)。
