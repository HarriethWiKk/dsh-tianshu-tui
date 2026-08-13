# dsh-tui 发布计划（内部文档，不随包分发）

> 状态：**GitHub 已公开**（https://github.com/huiliyi37/dsh-tianshu-tui）。
> npm **尚未发布**（`private: true` 仍保留）。本文件是 npm 发布时的操作清单。

## 当前状态（2026-08-13）

- `@deepseek-ai/dsh-tianshu-tui` 已移植到公开版形态（`packages/tui/tui`，P1 适配完成）
- 发布形态就绪：peer 真实版本范围、`publishConfig.access: public`、`engines`、`keywords`、`files`（含 NOTICE/SOURCE-MAP.md）、`dsh.bundle.patch`
- 本地验证通过：tsc（tui 闭包）、vitest 1515/1515、单包 tsdown 构建、`pnpm pack` 产物结构核对
- 装配启动 + 真实对话冒烟通过（2026-08-13，基于 0812 快照 p1-work 工作区）：见下方「本地启动验证」
- **`private: true` 有意保留**：发布防误触发的最后一道闸，发布第一步才移除

## 本地启动验证（2026-08-13，基于 0812 快照 p1-work）

隔离 `DSH_HOME` 下把本仓包装为 tui profile 并伪终端启动：界面渲染正常（会话短
id、`◆ ○ 空闲` 状态行、输入行占位、`normal` 模式徽标、15s 静默提示为 fluency
设计行为），退出时终端状态正确恢复。

真实对话轮次也已验证（2026-08-13，带真实 `DEEPSEEK_API_KEY`）：欢迎页完整出画
（鲸鱼像素画 truecolor 半块渲染、品牌区、菜单、`graphite · API Key ✓ · Git ✓`
环境行），发送中文消息后走完整轮次——思考流逐字渲染、markdown 列表转 `◇` 项、
footer 实时显示 `deepseek-v4-flash · effort:high · 缓存/上下文` 指标，第二次调用
缓存命中 100%。覆盖「装配 → 启动 → 欢迎页 → 真实 LLM 对话 → 渲染 → 退出」。

复现配方（在 p1-work 工作区执行）：

    # 一次性前置：宿主 host 面构建（先删/挪走 packages/tui/lib 残留目录，
    # 见「发布步骤」第 3 条已知问题；现行 tsconfig 不会再生成它）
    node_modules/.bin/tsc -b tsconfig.host.json
    node_modules/.bin/tsdown --env.DSH_BUILD_FACE host

    # 安装 + 启动（node 直起 CLI，绕开 pnpm run 包装触发的 pnpm 11 依赖校验清装提示）
    DSH_HOME=/tmp/dsh-tui-smoke node --import tsx/esm apps/cli/src/bin.ts \
      plugin --profile tui add link:$PWD/packages/tui/tui
    DSH_HOME=/tmp/dsh-tui-smoke node --import tsx/esm apps/cli/src/bin.ts --profile tui

注意事项：

- 安装用 `link:` 而非 `file:`——`file:` 把包复制出工作区，宿主构建产物缺失时
  tsx 的 tsconfig paths 兜底失效；`link:` 真实路径留在工作区内。宿主 host 面
  构建完备后两者皆可，`link:` 更稳。
- **插件运行时加载的是 `lib/index.js`（tsdown bundle），不是 src**——包 exports
  的 `.` 指向 bundle，即使 CLI 带 `--import tsx/esm` 也不会回落到源码。改完
  src 必须重建单包，否则跑的是旧代码且毫无报错。构建是两段管线，**缺一不可**
  （tsdown 的 entry 是 `lib/types/*.js`——tsc 的输出，不是 src；只跑 tsdown
  会把旧 tsc 产物重新打包，产出新旧混合的 bundle）：
  `node_modules/.bin/tsc -b packages/tui/tui`
  `CI=true node_modules/.bin/tsdown --env.DSH_BUILD_FACE host --filter @deepseek-ai/dsh-tianshu-tui`
  （直接调 `.bin` 绕开 pnpm 11 无 TTY 时 `confirmModulesPurge` 中止；`--filter`
  精确包名匹配可用，正则不可用。删除 src 文件后 tsc 增量不清孤儿产物，
  需手动删对应 `lib/types/**` 输出再打包。）
- **`script` 伪终端捕获必须先设窗口尺寸**——无控制终端时 pty winsize 为 0×0，
  `stdout.columns=0` 会让所有居中/截断文本渲染成空串（欢迎块「隐形」，只剩
  SGR 壳）。捕获命令内先 `stty rows 40 cols 100` 再 exec。
- **失效代理会让 LLM 请求无限挂起**——`HTTPS_PROXY` 等指向未运行的本地代理时，
  启动期的「理解」阶段就会卡在 `Waiting for response`。冒烟前 unset 代理环境
  变量或确认代理存活。
- profile 机制对本地未发布包开箱即用：`dsh plugin` 是 pnpm 转发器（支持
  path spec），profile 的 `autoInstallPeers: false` + hoisted 布局让缺失 peer
  回落到宿主安装解析（`healProfilesModuleFallback` 锚定运行中的检出）。
- 待确认观察一枚：管道喂 stdin 的环境下，退出清屏后 node 进程有逗留；真终端
  未复现前不下结论。

## 仍未做的（npm）

1. 不执行 `pnpm publish` / `npm publish`，除非再次明确授权
2. 不提交 `.npmrc` / token
3. 不公开 0812 宿主整仓源码

## 发布前提（触发条件，全部满足才可发布）

- [x] 用户**显式授权**公开 GitHub（2026-08-13）；npm 仍需另一次明确授权
- [ ] 官方公开版 `@deepseek-ai/*` 核心包（session/agent/llm/tools/user-questions 等，peer 依赖）**已在 npm 发布**且版本与 `peerDependencies` 匹配（当前 `^0.1.0-rc.6` 线；`dsh-workflow` 仍未上架）
- [x] 官方 `@deepseek-ai/cordis` 已在 npm 发布（当前 `^4.0.1` 线）
- [ ] 包名 scope 决策：`@deepseek-ai/dsh-tianshu-tui`（需官方 org 授权）或独立 scope（如 `@dsh2026/dsh-tui`）——**待用户决定**

## 发布步骤（未来执行，现在不做）

1. 移除 `package.json` 的 `"private": true`
2. 补 `repository`/`homepage` 字段（指向届时确定的公开仓库）
3. 全量门禁：`pnpm run typecheck && pnpm run test && pnpm run lint && pnpm run build`
   - 已知（2026-08-13 已定位根因，workaround 实测通过）：tsdown 全量 workspace
     构建报 `[@deepseek-ai/dsh-root] Cannot find entry`，是两个问题叠加：
     (a) tsdown 0.22 把仓根也算作 workspace 成员，而根包无入口——根目录放 stub
     `lib/types/index.js`（内容 `export {}`）可绕过；
     (b) `packages/tui/lib`（P1 迁移期的 tsc 输出残留目录，无 package.json，
     现行 tsconfig 不再生成）被 `packages/*/*` 成员 glob 误认成包，tsdown 向上
     解析包名走到仓根，错误标签因此也显示为 dsh-root——此前「与 tui 无关」的
     判断不准确，删除该残留目录即可。`--filter` 绕不过去：CLI 实现对字符串只做
     精确相等匹配，帮助文本里的正则写法未实现。两步处理后 host 面全量构建通过
     （约 170 包 / 11s 实测）。
4. `pnpm pack` 核对产物（对照下方清单）
5. `npm login`（或配置 CI token）后 `pnpm publish --access public`（在用户授权的发布通道执行）
6. 发布后验证：干净环境 `dsh plugin --profile tui add @deepseek-ai/dsh-tianshu-tui && dsh --profile tui`

## 发布前检查项（本次已完成的）

- [x] 敏感词扫描：无 internal build/企业微信群/telemetry 默认上传等内部标识
- [x] 无路径/用户名泄露（huiliyi37/banxia 等零命中）
- [x] `天枢`/`RIVET_*` 字样 = 上游 Tianshu-Tui（Apache-2.0，公开）的合法来源标识，保留（SOURCE-MAP.md 声明）
- [x] Apache-2.0 再分发要件：LICENSE、NOTICE、SOURCE-MAP.md（含修改声明）均在 `files`
- [x] tarball 结构：lib/index.js、lib/invariant.js、lib/types/**、cordis.patch.yml、LICENSE、NOTICE、SOURCE-MAP.md、README（md/zh）
- [x] 运行时 import 声明核对：lib/index.js 外部依赖 8 个（dsh-agent/llm/session/user-questions + chalk/diff/get-east-asian-width/string-width）全部在 peer/dependencies 中
- [x] 版本线：`0.1.0-rc.6` 对齐官方 npm `next`；peer `^0.1.0-rc.6` / `^4.0.1`

## 发布后仍需跟进（Phase 2+）

- rewind 对接公开版 fork 派生语义（当前 convo/both 模式 fails loud）
- 公开版 fs-snapshot / memory 服务落地后的功能恢复
- 与官方版本节奏对齐：公开版正式版（非 rc）发布后更新 peer 范围
- `dsh tui` 短命令（官方 CLI 加 3 行或 shell alias）
