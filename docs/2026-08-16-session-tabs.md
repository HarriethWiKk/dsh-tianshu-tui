# 会话 Tab 栏实施计划(Claude Code 桌面版并行会话的 TUI 形态)

日期:2026-08-16
依据:docs/2026-08-16-claude-code-benchmark.md 六节候选 1。

## 形态

- **位置**:live 区 chrome 段(提问/审批之前、输入轨上方)一行;会话数 >1 时显示。
- **外观**:`[s-3a2f] [s-9b1c] [s-4d7e●] …`——短 id + 当前会话 ● 高亮;
  窄宽从旧到新丢 tab,超限折叠 `+N`;单行不换行(维持单逻辑行契约)。
- **切换**:`Ctrl+X` 循环下一个(新增 KeyName);`Alt+1`~`Alt+9` 直接跳第 N 个
  (ESC+digit 解析已存在:meta=true + char 数字)。
- **刷新**:attach / newSession / switchSession / 恢复会话后异步 listSessions 更新
  缓存(不逐帧 IO)。

## 键盘事实(已核实)

- input-handler:`\x1b` + 可打印字符 → meta:true + char(Alt+数字可直接用)。
- Ctrl+Tab 终端编码不统一(kitty/xterm 不同),不用;新增 `Ctrl+X`(0x18),
  CTRL_CODES 加 `0x18: 'ctrl_x'` + KeyName union 加 `'ctrl_x'`。

## 改动

1. `src/engine/input-handler.ts`:CTRL_CODES + KeyName 加 `ctrl_x`。
2. 新 `src/format/session-tabs.ts`(纯函数,可单测):
   `formatSessionTabs(tabs: { id, label, current? }[], width): LiveRegionLine[]`——
   短 id 取自传入 label(调用方截短);当前 ● + primary 高亮;窄宽丢旧 tab + `+N`。
3. `src/ui/app.ts`:
   - 状态 `sessionTabs: { id, label, current }[] | null` + `refreshSessionTabs()`
     (async listSessions → 截短 id → 缓存 + flushLiveRender);
     attach / newSession / switchSession / restoreRecent 后调用。
   - buildFrame chrome 段:sessionTabs 非空且长度 >1 时渲染 tab 行。
   - handleKey:`ctrl_x` → 切下一个;`meta && char 1-9` → 跳第 N 个。
4. 测试:
   - `tests/session-tabs.spec.ts`:纯函数(渲染/当前 ●/窄宽丢+折叠/空态)。
   - `tests/app.spec.ts`:Ctrl+X 切下一个(switchSession 被调)、Alt+2 跳转、
     新会话后 tab 刷新。

## 验证

typecheck + 全量 npm test;SOURCE-MAP.md 补 session-tabs.ts 条目。

## 范围外

- tab 栏不做会话销毁/重命名(超展示层职责)
- 鼠标点击切换(项目无鼠标事件处理)
