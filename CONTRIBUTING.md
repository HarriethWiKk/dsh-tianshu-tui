# 贡献指南

感谢你考虑为 dsh-tianshu-tui 做贡献!本文档是 `@huiliyi37/dsh-tianshu-tui` 的共享
开发契约,适用于在本仓库工作的所有人(人与编码 Agent)。

本仓库同时包含两个独立插件:根目录 `@huiliyi37/dsh-tianshu-tui`(终端 UI)与
`vision-ask/` 子目录 `@deepseek-ai/dsh-vision-ask`(视觉副驾)。本文适用于两者。

## 如何贡献

- **报告 bug 或请求功能**:提交 issue,附清晰的复现步骤与终端环境。
- **提交 PR**:base 指向 `main`。保持改动聚焦——一个 PR 一个逻辑改动。描述写清
  动机、改动点与验证方式。
- **请求 review 前先跑验证矩阵**(下方)。CI 运行的就是这些命令。
- 新功能应附带或扩展一个聚焦的测试(纯函数层优先——渲染/折叠逻辑放 `format/`
  等无 I/O 模块,测试成本最低)。

## 验证矩阵

```sh
npm run typecheck   # tsc --noEmit(src + tests)+ vision-ask 独立 tsconfig
npm test            # vitest run(主仓)+ vitest run --root vision-ask
```

- 主仓与 vision-ask 各是一套独立测试;改哪边跑哪边,提交前全量。
- 新增 `src/` 文件必须补 `SOURCE-MAP.md` 条目(测试护栏会拦)。
- 改 README(中或英)必须同步另一侧,并更新 `README.i18n.yaml` 哈希:

```sh
git hash-object README.md README.en.md
```

## 代码规范

- 类型优先:`noUncheckedIndexedAccess` 开启,索引访问做显式防御;
  `exactOptionalPropertyTypes` 开启,可选字段用条件展开,不显式传 `undefined`。
- 纯函数纪律:渲染/折叠函数不碰 I/O、不依赖全局时间(注入或参数化)。
- 命名与注释跟随现有中文注释风格(模块头 JSDoc 说明职责与数据源)。
- 高危命令纪律与敏感文件规则见 [AGENTS.md](AGENTS.md)(agent 必读,人同样适用)。

## 架构边界(改动前必读)

- 纯展示契约:不注册 prompt/工具/上下文面;不 mutate 请求;workflow 无控制权。
  完整边界与"刻意不做"清单见 [ADAPTER.md](ADAPTER.md)。
- 挂起交互进控制器(question/approval/btw),渲染进 `format/` 纯函数,
  事件折叠是纯 fold——不要往 `ui/app.ts` 单体内堆状态机(约 3.6k 行,C4 拆分
  持续推进中)。
- 服务依赖:必选 inject 只有 sessions/agents/agentDefaultModel;新服务依赖一律
  可选 + `reflect.get` + fails loud(缺插件不能阻塞 TUI 启动,这是既有硬约束)。

## 文档规范

- 面向用户文档放 `docs/`(getting-started / architecture / configuration /
  interaction / themes / plugins / vscode),README 是功能全表入口。
- 内部工程文档(RELEASE/PUBLISH-PLAN/计划记录)也放 `docs/`,与用户文档并列,
  用文件名与内容区分。
- 文档与代码同步:改交互/配置/命令行为时,同步更新对应文档与 `/help` 描述。

## 发布

发版只按 [docs/RELEASE.md](docs/RELEASE.md) 执行:版本 bump、bundle 重建跟仓、
README 更新说明(中英)、测试门、tag、双 remote 推送(github + omdsh)、
npm publish(`--tag latest`)、GitHub Release。硬约束:不推 `origin`(本地 bundle)、
不提交 token、不 force-push `main`。

## 社区

- 主仓:https://github.com/huiliyi37/dsh-tianshu-tui(Issue / Release 开在这里)
- 组织 fork:https://github.com/omdsh-dev/dsh-tianshu-tui(镜像代码与 tag)
- 友情链接见根 README 末尾(Web UI、插件导航等社区项目)
