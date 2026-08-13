# dsh-tui 独立基线仓 — 开发说明

本仓库是 `@deepseek-ai/dsh-tui` 终端 UI 插件的独立基线仓（local-only，不配置 remote）。

## 来源

- 代码源自 DeepSeek Harness 内部开发版 `packages/tui/tui`，经 P1 适配移植为公开版可插拔
  bundle 形态（见 `docs/PUBLISH-PLAN.md` 与 git 历史首条提交）。
- 渲染核心移植自天枢 / Tianshu-Tui（Apache-2.0，公开上游），来源与修改声明见
  `SOURCE-MAP.md` 与 `NOTICE`。

## 结构

```
src/                插件源码（tui-runner 入口见 src/index.ts）
tests/              vitest 测试套件（app.spec.ts 黑盒 + 装配测试等）
docs/               内部文档（PUBLISH-PLAN.md 发布计划；projection-layer.md 等）
cordis.patch.yml    bundle patch：`dsh plugin add` 装配层
package.json        包清单（发布形态已就绪；private 有意保留，见发布计划）
tsdown.config.ts    打包配置（lib/types/*.js → lib/index.js + lib/invariant.js）
```

## 依赖前提

peerDependencies 指向 `@deepseek-ai/*` 与 `@deepseek-ai/cordis`（`^0.0.1-rc.2` 版本线）。
这些包当前**未发布到 npm**——`pnpm install`、`tsc`、`vitest` 需在官方包发布后，或在
公开版 monorepo 环境中运行（P1 适配与全部验证均在公开版 monorepo 工作区完成：
`pnpm exec tsc -b packages/tui/tui`、`pnpm vitest run packages/tui/tui/tests`）。

## 构建

```sh
tsc -p tsconfig.json --noEmit   # 类型检查（需 peer 已安装）
tsdown --config tsdown.config.ts  # 产出 lib/index.js + lib/invariant.js
```

## 保密

保密阶段：不推送、不发布、不外发。发布前提与步骤见 `docs/PUBLISH-PLAN.md`。
