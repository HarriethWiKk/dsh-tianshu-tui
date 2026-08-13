# dsh-tui 发布计划（内部文档，不随包分发）

> 状态：**保密阶段**。代码已整理为可独立发布形态，但**未执行任何发布动作**——
> 不推送 git、不发布 npm。本文件是未来发布时的操作清单与检查项。

## 当前状态（2026-08-13）

- `@deepseek-ai/dsh-tui` 已移植到公开版形态（`packages/tui/tui`，P1 适配完成）
- 发布形态就绪：peer 真实版本范围、`publishConfig.access: public`、`engines`、`keywords`、`files`（含 NOTICE/SOURCE-MAP.md）、`dsh.bundle.patch`
- 本地验证通过：tsc（tui 闭包）、vitest 1515/1515、单包 tsdown 构建、`pnpm pack` 产物结构核对
- **`private: true` 有意保留**：发布防误触发的最后一道闸，发布第一步才移除

## 保密边界（红线）

1. 不执行 `git push`（任何 remote）
2. 不执行 `pnpm publish` / `npm publish`
3. 不提交 PR / ISSUE / 公开讨论
4. 不把 tarball、bundle、代码片段外发给任何人
5. 本分支不配置 npm 认证 token（发布时才需要）

## 发布前提（触发条件，全部满足才可发布）

- [ ] 用户**显式授权**发布（本清单不构成授权）
- [ ] 官方公开版 `@deepseek-ai/*` 核心包（session/agent/llm/tools/user-questions 等，peer 依赖）**已在 npm 发布**且版本与 `peerDependencies` 匹配（当前 `^0.0.1-rc.2` 线）
- [ ] 官方 `@deepseek-ai/cordis` 已在 npm 发布（当前 `^4.0.1-rc.1` 线）
- [ ] 包名 scope 决策：`@deepseek-ai/dsh-tui`（需官方 org 授权）或独立 scope（如 `@dsh2026/dsh-tui`）——**待用户决定**

## 发布步骤（未来执行，现在不做）

1. 移除 `package.json` 的 `"private": true`
2. 补 `repository`/`homepage` 字段（指向届时确定的公开仓库）
3. 全量门禁：`pnpm run typecheck && pnpm run test && pnpm run lint && pnpm run build`
   - 已知：tsdown 全量 workspace 构建会报 `[@deepseek-ai/dsh-root] Cannot find entry`
     （root 为无 entry 的 solution 包；2026-08-13 在本地复现，疑似 tsdown 版本行为，
     与 tui 无关）——若官方构建同样复现需在发布前排查，或改用单包构建产物
4. `pnpm pack` 核对产物（对照下方清单）
5. `npm login`（或配置 CI token）后 `pnpm publish --access public`（在用户授权的发布通道执行）
6. 发布后验证：干净环境 `dsh plugin --profile tui add @deepseek-ai/dsh-tui && dsh --profile tui`

## 发布前检查项（本次已完成的）

- [x] 敏感词扫描：无 internal build/企业微信群/telemetry 默认上传等内部标识
- [x] 无路径/用户名泄露（huiliyi37/banxia 等零命中）
- [x] `天枢`/`RIVET_*` 字样 = 上游 Tianshu-Tui（Apache-2.0，公开）的合法来源标识，保留（SOURCE-MAP.md 声明）
- [x] Apache-2.0 再分发要件：LICENSE、NOTICE、SOURCE-MAP.md（含修改声明）均在 `files`
- [x] tarball 结构：lib/index.js、lib/invariant.js、lib/types/**、cordis.patch.yml、LICENSE、NOTICE、SOURCE-MAP.md、README（md/zh）
- [x] 运行时 import 声明核对：lib/index.js 外部依赖 8 个（dsh-agent/llm/session/user-questions + chalk/diff/get-east-asian-width/string-width）全部在 peer/dependencies 中
- [x] 版本线：`0.0.1-rc.2` 对齐公开版；peer `^0.0.1-rc.2` / `^4.0.1-rc.1`

## 发布后仍需跟进（Phase 2+）

- rewind 对接公开版 fork 派生语义（当前 convo/both 模式 fails loud）
- 公开版 fs-snapshot / memory 服务落地后的功能恢复
- 与官方版本节奏对齐：公开版正式版（非 rc）发布后更新 peer 范围
- `dsh tui` 短命令（官方 CLI 加 3 行或 shell alias）
