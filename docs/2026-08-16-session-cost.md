# 会话成本汇总实施计划(benchmark 候选 2,Claude Code /cost 形态)

日期:2026-08-16
依据:docs/2026-08-16-claude-code-benchmark.md 六节候选 2。

## 形态

`/cost` 命令把**当前会话**的累计用量与成本估算 echo 到滚动区(CC /cost 风格):

```
会话成本统计
· deepseek-v4-flash — 输入 12.3k · 缓存读 8.1k · 写 1.2k · 输出 4.5k · 推理 2.1k · $0.04
· deepseek-v4-pro — …
合计:输入 15.4k · 输出 6.2k · $0.11
```

- 数据源:assistant/message 事件的 `usage`(每次请求计量)按模型分桶**累计**
  (现有 usageFold 只保留最后一条,不满足累计)。
- 模型 key:最近一次 `request/header` 的 `config.model`(wire id,如
  deepseek-v4-flash);未知时为 `unknown` 桶。
- 成本:每桶调 estimateCost(pricing.ts 已有定价表;未知模型不猜价)。
- 会话边界:切会话/卸载时复位(与 usageFold 同点)。

## 改动

1. 新 `src/format/session-cost.ts`(纯函数,可单测):
   - `SessionCostBucket`:model + input/cacheRead/cacheWrite/output/reasoning(字段
     兼容 TokenUsage 形状,可直接喂 estimateCost)
   - `accumulateUsage(bucket, usage)` → 累加(缓存字段缺省按 0)
   - `formatSessionCostReport(buckets) → string[]`:标题/每模型行(复用
     formatTokenCount + estimateCost)/合计行;空桶 → 占位提示。
2. `src/ui/app.ts`:
   - `sessionCosts = new Map<string, SessionCostBucket>()`
   - assistant/message 折叠处:按 `glanceModelName ?? 'unknown'` 桶累加
   - detachProjections 卸载复位(与 usageFold 同点)
   - deps 回调 `sessionCostReport(): string[]`(调纯函数)
3. `src/commands/registry.ts`:
   - BUILTIN_COMMAND_NAMES 加 `'cost'`
   - BuiltinCommandDeps 加 `sessionCostReport(): string[]`
   - `/cost` run:无桶 → echo「本会话尚无用量数据」;否则逐行 echo。
4. 测试:
   - `tests/session-cost.spec.ts`:accumulate(累加/缓存字段缺省)、report(多模型/
     合计/未知模型无价/空)
   - `tests/app.spec.ts`:注入两次 usage(不同模型)→ /cost 输出明细与合计
   - `tests/commands.spec.ts`:/cost 接线(空数据提示/有数据逐行)

## 验证

typecheck + 全量 npm test;SOURCE-MAP.md 补 session-cost.ts 条目;
docs/interaction.md 命令表加 /cost。

## 范围外

- 跨会话成本汇总(只统计当前会话)
- 成本持久化(重启丢失;usage 事件仅内存)
