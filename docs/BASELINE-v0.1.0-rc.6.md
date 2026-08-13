# 第一版本基线：v0.1.0-rc.6

记录日期：2026-08-13。这是本插件第一次对外可安装、并在官方 DeepSeek Harness 上实测启动成功的冻结点。

## 坐标

| 项 | 值 |
|---|---|
| Git tag | `v0.1.0-rc.6` |
| npm | `@huiliyi37/dsh-tianshu-tui@0.1.0-rc.6`（`latest`） |
| GitHub | https://github.com/huiliyi37/dsh-tianshu-tui |
| 插件 id | `tui-runner`（不要改） |
| 宿主 CLI | `@deepseek-ai/dsh@0.1.0-rc.6` |
| 用户配置目录 | `~/.dsh-tui`（有意未随包名改） |

## 安装（基线命令）

```sh
npx -y @deepseek-ai/dsh plugin --profile tui add @huiliyi37/dsh-tianshu-tui
npx -y @deepseek-ai/dsh --profile tui
```

需要 Node.js `^22.19 || >=24` 与 PATH 上的 `pnpm`。不要直接敲 PATH 上旧的 `dsh`（`dsh --version` 不是 `0.1.0-rc.6` 时会走到本地 staging，出现 `ERR_FS_EISDIR`）。

## 本基线包含的修复

- 仓库跟仓 `lib/index.js` / `lib/invariant.js`，`github:` 安装不必在 harness 工作区再打包。
- bundle 禁止引用未发布的 `@deepseek-ai/dsh-root`（issue #1）。
- 包名从 `@deepseek-ai/dsh-tianshu-tui` 改为已发布的 `@huiliyi37/dsh-tianshu-tui`。
- README 安装引导放在最前面，主路径为 `npx @deepseek-ai/dsh`。

## 实测

2026-08-13 隔离 `DSH_HOME=/tmp/dsh-tianshu-envtest`，按上面两条命令安装并启动：欢迎页出现 `dsh-tianshu-tui`，`deepseek-v4-flash · API ✓`，无 `dsh-root` 加载错误。
