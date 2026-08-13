# dsh-tui 独立基线仓 — 开发说明

本仓库是 dsh 公开版插件的独立基线仓（local-only，不配置 remote），当前含两个独立插件：
`@deepseek-ai/dsh-tianshu-tui`（终端 UI，本仓根部）与 `@deepseek-ai/dsh-vision-ask`（视觉副驾：
会话图片注册表 + ask_image 工具，`vision-ask/` 子目录，将来可整体拆独立仓）。

## 来源

- 代码源自 DeepSeek Harness 内部开发版 `packages/tui/tui`，经 P1 适配移植为公开版可插拔
  bundle 形态（见 `docs/PUBLISH-PLAN.md` 与 git 历史首条提交）。
- 渲染核心移植自天枢 / Tianshu-Tui（Apache-2.0，公开上游），来源与修改声明见
  `SOURCE-MAP.md` 与 `NOTICE`。
- vision-ask 移植自 opencode-tui 的 image-registry / ask-image / vision-service
  （Apache-2.0 上游），设计决策与溯源见 `vision-ask/docs/` 与包内注释。

## 结构

```
src/                插件源码（tui-runner 入口见 src/index.ts）
tests/              vitest 测试套件（app.spec.ts 黑盒 + 装配测试等）
docs/               内部文档（PUBLISH-PLAN.md 发布计划；projection-layer.md 等）
cordis.patch.yml    bundle patch：`dsh plugin add` 装配层
package.json        包清单（发布形态已就绪；private 有意保留，见发布计划）
tsdown.config.ts    打包配置（lib/types/*.js → lib/index.js + lib/invariant.js）
vision-ask/         独立插件 @deepseek-ai/dsh-vision-ask（自有 package.json/tsconfig/src/tests）
```

## 依赖前提

peerDependencies 指向 `@deepseek-ai/*` 与 `@deepseek-ai/cordis`（`^0.0.1-rc.2` 版本线）。
这些包当前**未发布到 npm**——`pnpm install`、`tsc`、`vitest` 需在官方包发布后，或在
公开版 monorepo 环境中运行（P1 适配与全部验证均在公开版 monorepo 工作区完成：
`pnpm exec tsc -b packages/tui/tui`、`pnpm vitest run packages/tui/tui/tests`）。
vision-ask 的附件引用均为 type-only：行为测试可在任一解析 dsh-llm/dsh-tools 的
工作区运行（`vitest run vision-ask/tests/`）；类型面在公开版环境复核。

## 构建

```sh
tsc -p tsconfig.json --noEmit   # 类型检查（需 peer 已安装）
tsdown --config tsdown.config.ts  # 产出 lib/index.js + lib/invariant.js
# vision-ask（独立 tsconfig/打包）
tsc -p vision-ask/tsconfig.json --noEmit
```

## 保密

保密阶段：不推送、不发布、不外发。发布前提与步骤见 `docs/PUBLISH-PLAN.md`。
