# 盘活 dsh 内核协同：深度头脑风暴结果

## 背景

### 用户需求（原文）

通过完整查看 Cordis 论文，深入了解本仓库 dspark 的作用机制和原理，结合论文实践找优化点，包括 dsh、MoE、意图路由，彻底盘活 dsh 内核，做协同机制 / 工作流协同。

### 问题层级

- 主层级：L2 链路结构 — 内核如何把模型路由、专家派发、意图分类接到同一套可卸载纤维上
- 关联：L1 业务目标（盘活内核协同）、L4 选择评审（档位/专家怎么选）、L5 handoff（父纤维何时卸责）
- 本轮不处理：L7 落地代码（等本设计审查后再写实施计划）

### 分析对象（本轮假设，可改）

「本仓库」是 TUI 插件仓 `dsh-tui`，但 **dspark / MoE / 意图路由不在这个仓里实现**。

| 名字 | 实际落点 |
|------|----------|
| 论文 Cordis | `deepseek-harness/vendor/cordis` + 内核各 `ctx.inject`/`provide`/`effect` |
| dspark | **推理尾部截断协议**（不是模型名、不是 compaction 85%）：带 `tool_calls` 的 assistant 回传 `reasoning_content` 时只留尾部 N token（flash=300 / pro 默认 0）；session log 保留全文；丢失头段里的排除句提取为锚点回灌。本仓 TUI 别名仍指向 `deepseek-official`，**截断未接通**。`tianshu-public` 已有移植（`spark.ts` + `spark-anchors`）。 |
| dsh 内核 | `deepseek-harness`：`agent/request`、`llm/stream`、`subagents.start`、`workflowEngine` |
| MoE | 模型侧 DeepSeek V3/V4 专家路由；软件侧天枢 Galaxy / `expert-router` |
| 意图路由 | 天枢 `IntentRetrievalRouteController`（heuristic/llm → 检索建议 + A–E 协作分支） |

### 项目上下文

- TUI `tui-runner` 必选 inject：`sessions/agents/agentDefaultModel/goals/subagents`；`cmdlineArgs/appExit` 已从必选列表拿掉（否则宿主未 provide 时静默永不激活，对应论文 §5.4）。
- TUI 自称纯展示：agent 状态经 `TuiPort`；`/workflow` `/subagents` 只订阅内核事件。
- 内核 `llm-deepseek` 只注册 `deepseek-official`。同一 adapter 实例可以挂多个 provider 名；**同名**第二份抛 `DUPLICATE_ADAPTER`。
- 天枢 Galaxy 实测：同 authority 连续请求前缀缓存命中 99.2%，跨 authority 为 0%。

### 需求变更（2026-08-15 12:52）

用户纠正：Spark 机制是**截断思维链，只回传 300 token 给下一轮**。  
影响：Spark 生态位从「provider / compaction 策略面」变成「wire 上的有损推理投影 + 锚点余效应」。从第一轮重新辐射 Spark 相关方案。上一轮灭绝的 V1（迁天枢 loop）/ V2（路由写进 TUI）原因仍有效，不复活。

### 调研发现摘要

- **Scout A（开源 DI/HMR）**：Koishi/Cordis 的「服务代理」是调用方绑定的 `this.ctx` Proxy，不是流量多路。同名服务是替换。`isolate` 是空间隔离。循环 required inject → 双方 PENDING，apply 永不跑。
- **Scout B（急诊 ESI + 空管移交）**：先 ACK 再卸责；移交窗口冻结写；只升不降；只切新请求，在途排空；软亲和 + 过载才迁 + 迟滞。
- **Scout C（代码）**：子代理触达 API 限额未返回；由主会话直接读三仓源码补全。意图路由、bandit、Galaxy、spark 策略面全在天枢 loop；内核已有可换 provider 的瀑布和可钉扎子代 `agentOptions`；workflow 卸载不撤销已接受 run（刻意 holder-owned）。
- **Scout D（反证）**：子代理同样触达限额；由主会话按代码核验。把 Spark 做成 `isolate('llm')` 会给子代另一套 llm 服务，过重且不是论文 §5.1 的滚动更新。`intercept` 只合并插件配置。意图写进冻结 system 会打爆 exact-prefix（天枢已踩过：158/160 `frozenEvicted`）。
- **Spark 机制（用户纠正 + 源码）**：天枢 `openai-client` 在 preserved-thinking + 有 tool_calls 时走 `proRegistry.getWireTransform`（开源构建恒空）。`reasoning-anchors.ts` 写明：wire 截断推理尾部 N 之外的前段；完整推理只在内存/jsonl。`tianshu-public` 的 `truncateReasoningTail`：flash 留尾 300 token，copy-on-write，无 tool_calls 的纯文本轮不回传 reasoning。铁律：**截断必须与锚点同时落地**。
- **跨领域资料见** [research/2026-08-15-unrelated-domain-handoff-practices.md](../research/2026-08-15-unrelated-domain-handoff-practices.md)。

---

## 三轮思考过程

### 第一轮：变异

```
[VARIATION]
生态位: 个人/小团队用 dsh TUI 跑 DeepSeek V4；内核已是 Cordis 纤维；协同智能在天枢、展示在 TUI、中间没接线
选择压力: 可卸载、不打断在途、不打爆前缀缓存、TUI 保持纯展示、一个人能落地验证
已占据: 天枢自有 AgentLoop+Galaxy；内核单会话单路由；TUI 别名伪装 Spark
空位: 把意图/档位/专家派发放进可卸载的内核插件，挂已有瀑布，而不是再写一套 loop
调研发现: 同名服务不能双活；agent/request 允许跨 turn 换 provider；子代可钉 agentOptions；意图每回合进冻结前缀会炸缓存

方案:
  V1(主流): 把天枢 Galaxy/intent/bandit/spark 整棵树迁进 harness，替换或并列 AgentLoop
           — 维护者把天枢 loop 搬进 dsh 包，用户在 TUI 里直接跑星河
  V2(邻近): 在 TUI 仓加路由插件和 /galaxy 命令，进程内改 agent/request
           — 用户敲 slash，TUI 插件改模型并派子代理
  V3(空位): 新内核插件 dsh-collab-router（纤维）：pre-step 写易失意图拖车；
           request 瀑布只在 turn 边界升级档位；subagents.start 按 authority 钉模型；
           Spark 用同一 adapter 的第二条 provider 名 deepseek-spark
           — 用户开 dsh，插件加载后下一回合按意图选 flash/pro 并派 complementary 子代
  V4(突变): 不做软件 MoE。只做 authority 亲和调度 + flash→pro 级联，协同交给模型内部专家
           — 用户始终单 agent，调度器只保证同前缀连续打、难了才换 pro

创始假设:
  - 「dspark」是可优化的机制，而不只是 UI 别名（过窄则 V3 的 Spark 名分裂无意义）
  - 「盘活内核」= 改 harness 接线，不是改 TUI 文案
  - 「协同」= 多纤维派发，不只是更好的单模型 prompt
适应度函数:
  硬约束= 不破坏 request reconstruction；必选 inject 不得静默永不激活；TUI 不拥有路由；卸载可逆
  加分= 可测（header.provider、cache 命中、flash 占比、unload 后无残留监听）
  减分= 端口径、每回合打缓存、bandit 默认 forced、双 loop 永久分叉
```

#### 生态位测绘（展开）

谁：一个人维护 TUI + 能提 harness PR 的开发者，不是 20 人实时系统组。  
场：`dsh` 进程，Cordis loader 装插件；模型是官方 V4 flash/pro（MoE 在服务端）。  
选择压力：论文要的时空可组合（卸载回退副作用、依赖反应式激活）目前只服务了 TUI 自己的生命周期，没有服务「这一回合该找谁、该用哪档、该派几个专家」。  
注定死掉的方向：在 TUI 里再实现一套 AgentLoop；给 `llm` 服务做 isolate 当负载均衡；把意图塞进冻结 system prompt。

#### 方案一句话（人-场-动-果）

- V1：维护者在 harness 里重写 loop，用户得到天枢同款星河，代价是两年分叉合不回去。
- V2：用户在 TUI 敲 `/galaxy`，TUI 插件改路由，得到协同，代价是展示层拥有内核。
- V3：维护者装一个可卸载插件，用户下一回合被分到 flash/pro 和钉扎子代，TUI 只继续画已有面板。
- V4：调度器把同 authority 请求排在一起，用户少付钱、少等 TTFT，但没有工作流协同。

---

### 第二轮：选择

**目标重注入（用户原话）：** 看完论文 → 搞清 dspark → 结合实践找优化（dsh / MoE / 意图路由）→ **彻底盘活 dsh 内核做协同机制工作流协同**。

```
[SELECTION]
目标偏移: V4 放弃「工作流协同」，只做调度亲和 — 灭绝候选
因果测试:
  V1: 通过但虚假因果风险高 — 「有天枢功能」≠「内核被盘活」；结果是第二个 loop
  V2: 断裂 — TUI 纯展示契约下，slash 改路由不能让内核纤维拥有副作用的逆
  V3: 通过 — 意图→档位→子代钉扎每一步都有已存在的瀑布/API；卸载走 fiber.dispose
  V4: 断裂于用户目标 — 优化了 MoE 亲和，没有协同工作流
成本测试:
  V1: 极高（月计 port）/ 收益是功能复制，内核组合性不增加
  V2: 低（本仓就能改）/ 机会成本=永久把智能焊在错误层
  V3: 中（新插件 + llm-deepseek 加一条 provider 名）/ 收益落在可卸载接线
  V4: 低（出队顺序）/ 收益只在 cache，不回答协同
共演化:
  V1: 静态 — 天枢概念冻结进内核
  V2: 静态 — TUI 命令表膨胀
  V3: 动态 — 插件可热卸；路由表只影响下一 turn；失败可 UNABLE 留在父纤维
  V4: 动态于成本，静态于协同
局部最优: V2 是最快的安全牌，但是层错误；V1 是行业「把功能合进核心」套路
落地性:
  V1: 第一步=列天枢 loop 对 harness 的依赖图 → 前置条件>3，过高
  V2: 第一步=改 SPARK_ALIASES 并在 app.ts 里 on agent/request → 可执行但越权
  V3: 第一步=llm-deepseek registerAdapter 增加 deepseek-spark 名，TUI 别名改指向 → 可执行
  V4: 第一步=subagent 出队按 authority 稳定排序 → 可执行但不覆盖目标
灭绝:
  V2 — 因果断裂：展示层不能成为路由权威；且必选 inject 一旦再塞路由服务会重蹈静默永不激活
  V4 — 目标偏移：用户要的是协同工作流，不是只省 cache
  V1 — 成本远超收益 + 双 loop；其映射表作为 discarded_trait 回收
存活:
  V3 — 优势: 挂已有瀑布；Spark 名分裂可测；TUI 继续只观察；符合论文可回退效应
最强竞争者: V3
新发现:
  - 论文 §5.1「服务代理」≠ LLM 多路复用；多路应用 named provider + waterfall
  - Spark 不能靠 isolate('llm')；要第二条 provider 名（同一 adapter 实例已有测试先例）
  - 意图必须进易失拖车（volatile trailer），禁止进冻结 system / 前缀锚点
```

#### 证据分层（反证）

| 发现 | 分类 | 处理 |
|------|------|------|
| `expectPrefixExtension` 要求同 turn 内 system/tools 是前缀 | 事实 | 档位/工具集禁止在 step 中途改 |
| `agent/request` 跨 turn 换 provider 有测试 | 事实 | 路由只许 turn 边界 |
| workflow 卸载不撤销已接受 run | 事实（契约） | 协同批次的 holder 必须是启动它的纤维，unload 只停新 start + 调 dispose |
| `isolate`/`intercept` 已实现 | 事实 | isolate≠LB；intercept=子树配置合并 |
| TUI 纯展示 | 惯例/现状 | 可质疑但本轮当作硬约束，否则本仓会变成第二个内核 |
| Spark 85% compaction 必须独立 provider 名 | 现状（天枢） | dsh 未必有同一套 compact ladder；Phase 1 只分裂名字，不发明压缩策略 |
| 意图每回合 invalidate | 现状 | 拖车必须在 last-user 之后、冻结快照之外 |
| 同 authority 缓存 99% | 事实（天枢探针） | 吸收为 V3 出队策略 |
| bandit 默认 shadow | 现状 | Phase 1 不做在线学习主路由（ESI：主路由用静态规则） |

---

### 第三轮：适应

```
[ADAPTATION]
套路清除:
  - 「把协同做成平台/生态」→ 删。落地是一个插件 + 一条 provider 名
  - 「用 isolate 做 Spark 多路」→ 删。isolate 是空间隔离
  - 「TUI 加 /galaxy 就盘活内核」→ 删。那是 V2
  - 「bandit 自动选模型」→ Phase 1 不用。主路由用意图种类硬规则，只升不降
扩展适应:
  - 已有 /workflow /subagents 面板 → 协同可视化零成本
  - installModelSelection 已把 agent/request 与 prompt 变量绑在一起 → 档位切换复用它而不是新通道
  - registerAdapter 多 name 同实例 → Spark 名分裂零新适配器
  - 吸收 V1 discarded_trait: TASK_KIND_BASELINES + expert-router 角色表
  - 吸收 V4 discarded_trait: authority 出队亲和 + flash 先行 escalate
  - 吸收 V2 discarded_trait: TUI 只观察，不实现
具体化:
  人: 跑 dsh TUI 的开发者；维护者改 harness 插件 + TUI 别名两行
  场: 一次用户回合结束、下一次 request/header 写入之前
  动: 见 Phase 1–3
  果: 会话日志里 spark-flash 的 provider 字段是 deepseek-spark；
      bug_fix 回合子代按 tianquan/tianfu 钉 flash；卸载 collab-router 后下一 turn 不再注入意图拖车
收敛验证:
  V1/V3/V4 都收敛到「前缀稳定 + 同专家连续打」；V2/V3 收敛到「TUI 必须能看见协同」——保留为原则
实施路径: 见下
最终方案: 见「最终方案」
最强适应点: 不新造 loop，把论文的可回退效应接到已经存在的三处瀑布
脆弱点: 意图拖车仍可能碰缓存；子代钉错模型；TUI 别名改完用户以为换了端点其实还是官方 API
         应对: 拖车只追加在 last-user 之后；子代失败 UNABLE 回父；文档写明 Spark=策略面不是私有集群
```

#### 人-场-动-果（最终，Spark 纠正后）

1. **维护者**把 `truncateReasoningTail` + 锚点插件接到 harness serialize / `agent/pre-step`（复用 tianshu-public，不要重写）。  
2. **TUI** 把 `SPARK_ALIASES` 指到 `deepseek-spark`（没有截断的别名不要先合）。  
3. **用户**在 spark-flash 下跑带工具的回合：下一请求的 `reasoning_content` 只剩尾 300 token；jsonl 仍是全文；丢失头段的排除句出现在下轮 user 注入。  
4. **协同**：子代并回父时走同一变换。  
5. **卸载**：enabled=false 或卸插件后，下一请求恢复全文回传，锚点停注。

---

### 修正轮：Spark 生态位重注入

用户纠正后从第一轮重新辐射（只动 Spark 切片；迁天枢 loop / TUI 路由仍灭绝）。

```
[VARIATION]
生态位: DeepSeek preserved-thinking 回传；flash 工具轮推理往往远超 300 token；前缀缓存要字节稳定
选择压力: 下一轮请求变短 + 模型不走已排除路径 + log 可还原全文
已占据: 天枢闭源 wire transform；tianshu-public 已移植；本仓只有指向 official 的别名
空位: 把「尾 300 + 锚点」当成父子协同的交接协议，而不只是单会话省 token

方案:
  S1(主流): 原样合入 tianshu-public 的 spark.ts + spark-anchors + 别名改指 deepseek-spark
  S2(邻近): 只截断 wire、不上锚点（省一个插件）
  S3(空位): 截断+锚点作为协同交接协议——父回合与 worker 并回都走同一 tokenizer/N
  S4(突变): 不截尾，每轮另调模型写成 300 token 交接胶囊

创始假设（已推翻）: Spark = provider 别名 / compaction 85%
适应度: 硬约束=截断与锚点成对；copy-on-write；无 tool_calls 不回传 reasoning
```

```
[SELECTION]
目标偏移: S4 把机制从「确定性截尾」改成「再写一遍摘要」，偏离用户给出的机制
因果测试:
  S1: 通过 — 截尾→请求变短；锚点→不回头。本仓尚未接通，合入即验证
  S2: 断裂 — 丢头段却不补排除句，模型重复推导（SAT 无 conflict clause）
  S3: 通过 — 在 S1 上把同一变换用在子代并回，才盘活「协同」
  S4: 断裂 — 非确定性、多一次调用、前缀不稳
成本测试: S1 低（代码已在 tianshu-public）/ S2 更低但违规 / S3 中（复用 serialize）/ S4 高
落地性: S1 第一步=把 spark.ts 接到 serializeRequest
灭绝: S2 — 铁律禁止单独截断；S4 — 不是用户说的机制
存活: S1（Phase 1）/ S3（Phase 1 之上的协同，最强）
最强竞争者: S3 = S1 的机制 + 子代并回复用
新发现: 本仓 SPARK_ALIASES→official 比「没登记第二条 route」更糟——用户以为在用 Spark，实际全文回传思维链
```

```
[ADAPTATION]
套路清除: 「Spark=换模型/换 key/换压缩梯子」
扩展适应: 空管双通道（log 全文 / wire 截断）；意图路由也是有损投影+余效应，可共用「丢失域才补偿」
具体化:
  人: 跑 /model spark-flash 且 spark.enabled 的开发者
  场: 下一轮 serialize 带 tool_calls 的历史 assistant
  动: 400 token 推理 → wire 尾 300；头 100 里的「不是 A」变成锚点 user 消息
  果: 下轮请求少 ~858 token 量级（tianshu-public 探针 74%）；jsonl 仍完整
实施路径: Phase 1 = S1；Phase 3 子代并回 = S3
```

---

## 最终方案

名称：**Turn-boundary collab fiber**（内核可卸载协同纤维）。不新造 AgentLoop，不把路由放进 TUI。

### 三层接线（对应论文两个正交维）

| 论文 | 内核已有 | 本方案接法 |
|------|----------|------------|
| 可回退效应 `track/recover` | `ctx.effect` / fiber.dispose | 路由监听、意图拖车、子代 handle 全部挂在 collab-router 纤维上 |
| 反应式余效应 `σ⊨d` | `ctx.inject` | 子代/workflow 用可选 inject 子纤维；缺服务则该能力不激活，主插件仍活 |
| §5.1 服务代理 | 调用方 `this.ctx` Proxy；**不是** LLM LB | Spark=第二条 provider 名；流量切分= `agent/request` 只改 **下一 turn** |
| §5.2 inject=能力请求，intercept=策略 | `intercept` 合并子树配置 | 子代可 `intercept` 超时；不要 isolate(`llm`) |
| §5.4 依赖环静默永不激活 | 已在 TUI 踩过 | collab 服务一律 optional 子纤维 |
| 纪元 / 惯性 | fiber 激活状态机 | 路由表更新不取消在途 run（workflow holder-owned 同构） |

### Spark（dspark）怎么盘 — 纠正后

Spark 不是换 endpoint，也不是 85% compaction。它是 **DeepSeek preserved-thinking 回传规则上的确定性变换**：

1. 仅 **带 tool_calls** 的 assistant 消息回传 `reasoning_content`（纯文本轮整段不回传，规则不变）。
2. 回传时只留**尾部 N token**（flash 默认 300，pro 默认 0=不截）。输出必须是原文连续子串，同一 tokenizer → 字节稳定（前缀缓存依赖）。
3. session log / 内存里的推理**全文保留**（serialize copy-on-write，不 mutate Message）。
4. 被切掉的头部里，用排除句正则抽出「已排除路径」，下一轮经 `agent/pre-step` 回灌（cap 20）。锚点只描述模型在 wire 上看不到的那段——与截断精确互补。
5. N 与 enabled 必须同源（settings / 会话冻结 `wireContext`）。一边截一边不灌锚点 = 模型走回头路。

本仓现状：`SPARK_ALIASES` → `deepseek-official`，**没有** `truncateReasoningTail`，用户切 spark-flash 不会截思维链。`tianshu-public` 已经把 Wave 1–3 做进 `llm-deepseek` + `spark-anchors`；当前 harness / 本仓 TUI 落后于那份移植。

论文对照（纠正后才对得上）：

| 论文 | Spark 实际动作 |
|------|----------------|
| 记忆态 Γ 完整 | jsonl 里全文 reasoning |
| 下一请求的有损投影 | wire 只带尾 300 token |
| 反应式余效应 σ⊨d | 锚点让「已排除路径」在截断后仍可见 |
| 纪元 | N 冻结；中途改 N = 前缀字节变，cache miss |
| 空管双通道 | 状态通道=全文 log；控制通道=wire 截断。ACK 前不卸责 = 没序列化成功前 log 不丢 |

协同用法：子代结果并回父上下文时，**同一套** truncate+anchors，禁止把 worker 全文思维链灌进父请求。这才是用 Spark 协议做工作流协同，而不是再发明一套摘要模型。

### 意图路由怎么接

天枢分类枚举可复用：`bug_fix | performance_diagnosis | new_feature | architecture_design | refactor | usage_question | codebase_overview | code_explanation | review_audit | verification | security_safety | social_idle`。

默认 **heuristic**（ESI：主路由用静态规则）。LLM 分类仅作补充，超时则回退 heuristic。

写入位置：`agent/pre-step` 之后、**last user 消息之后的易失拖车**（天枢 volatile trailer 同构）。禁止改 system、禁止改历史 user。置信度 <0.6 只写 advisory，不改档位（对应分支 A）。

协作分支 A–E 只作为派发许可，不自动开 5 个 agent。

### MoE / 专家怎么接

两层，不要混：

1. **模型 MoE**（服务端）：用 authority 亲和出队吃共享前缀 / 共享专家；这是 V4 回收的特征。  
2. **软件专家**（Galaxy 同构，缩到内核已有 API）：`selectExpertSet` 的角色保证（1 base + 1 constraint + 1 challenger）映射为最多 3 次 `subagents.start`，每个带自己的 `agentOptions`。DP 副本（同一任务多 replica）Phase 3 再做。

级联：默认 flash；分支 C/D 或验证失败 → 下一 turn 升 pro；禁止因「忙」降回 flash（ESI）。

### 工作流协同

- 编排脚本继续用现有 `ctx.workflowEngine`（模型可写 `agent()` fan-out）。  
- collab-router **不**替换 workflow 引擎。  
- **子代并回父请求时走同一 Spark 变换**：worker 的 `reasoning_content` 只留尾 300 token + 丢失域锚点，禁止把全文思维链灌进父上下文。  
- 卸载：引擎契约不变（不撤销已接受 run）。collab 纤维作为 holder 在 dispose 时对它 start 的 run 逐个 `dispose()`。  
- TUI 无需新面板。

### 明确不做

- 把天枢 `AgentLoop` 迁进 harness  
- 在 `dsh-tui` 实现路由  
- 默认打开 LinUCB 主路由  
- 依赖 API 暴露 expert activation（D1 方向 4）  
- 中途改 system/tools 来「热切换」专家 prompt
- **单独上推理截断、不上排除路径锚点**（桌面端 / tianshu-public 铁律）
- 把 Spark 理解成独立 API 集群或 compaction 85% 梯子

---

## 风险与应对

| 脆弱点 | 机制 | 应对 |
|--------|------|------|
| 意图拖车打缓存 | exact-prefix 对前缀字节敏感 | 拖车只接在 last-user 后；与天枢一样 pending-commit 先于 invalidate |
| 静默永不激活 | required inject 环 | 主插件只 inject `agents`；subagents/workflow 用子 `ctx.inject` |
| 在途被杀 | 误把 unload 当 cancel | 只停新 start；holder dispose；TUI 继续收到 `workflow/end` |
| 用户以为换了 Spark 集群 | 仍是官方 endpoint + 本地 wire 变换 | `/model` 写清：spark-flash = 官方 flash + 思维链尾 300 token 回传 |
| 专家坍缩（总派同一星域） | 关键词 rank 会塌 | 硬保证 base/constraint/challenger 各一，不靠分数独占 |
| 档位振荡 | bandit 无阻尼 | Phase 1 不用 bandit；升级有迟滞（连续 2 次失败才升） |
| 层越权 | 有人把插件写进 TUI 仓图快 | 本设计把实现放 harness 包；TUI 只改别名两行 |

---

## 实施路径

### Phase 1 — 最小可行验证（截断 + 锚点成对上线）

动作（优先复用 `tianshu-public` 已落地的 `spark.ts` / `spark-anchors`，不要重写算法）：

1. harness `llm-deepseek`：同一 adapter 登记 `deepseek-spark`；`Config.spark.enabled` 默认 false；flash N=300 / pro N=0。  
2. `serializeRequest`：仅 spark route + enabled + 带 tool_calls 时 `truncateReasoningTail`；session Message 不 mutate。  
3. `dsh-spark-anchors`：`agent/pre-step` 从丢失域提排除句，文本与上次不同才注入；enabled/N 与 wire **读同一 settings**。  
4. 本仓 `SPARK_ALIASES` 改为 `deepseek-spark` + 原 wire id（与 tianshu-public TUI 对齐）。  
5. 测试：400 字推理 → wire 尾 300 字且 `endsWith`；jsonl 仍 400 字；无 tool_calls 不回传 reasoning；enabled=false 时锚点零注入。

预期产出：`/model spark-flash` 且 spark.enabled 后，下一工具轮的请求里思维链最多 300 token。  
成功标准：上述测试绿；official 路由行为不变。  
退出：若真实 API 因截断 400 → 停，回滚 enabled；不得只关锚点留截断。

### Phase 2 — 意图拖车 + 只升不降

动作：

1. 新包 `dsh-collab-router`，Cordis 插件，`inject: ['agents']`。  
2. `agent/pre-step`：heuristic 分类，写易失拖车（可先 port 天枢 `buildHeuristicRetrievalRoute` 的表，不 port LLM 分类器）。  
3. `agent/request`：仅当 `turn` 变化且分支含 C/D 且当前是 flash 时，改 `model` 为 pro；写入 header reason=`change`。  
4. 卸载测试：dispose 插件后下一 turn header 不再含拖车，也无监听残留。

预期产出：bug_fix 下一回合升 pro（可配置关闭）。  
成功标准：同 turn 内 `expectPrefixExtension` 仍成立；卸载后无 `agent/request` 监听。  
退出：若拖车导致 prefix miss 率 >10%（对基线）→ 拖车改为只写 session 投影、不进模型请求，档位规则保留。

### Phase 3 — 专家纤维 + 亲和出队

动作：

1. 可选 inject `subagents`：按 `selectExpertSet` 最多 3 个子代，`agentOptions` 钉 spark-flash；同 authority 连续 start。  
2. workflow start 若存在，把 run 的默认子代路由设为同一策略。  
3. TUI 不改交互（已有面板）。  
4. 失败：子代 start reject = UNABLE，父继续；不把父 cancel。

预期产出：一次 bug_fix 可见 2–3 个 subagent 行，authority 连续。  
成功标准：跨 authority 交错出队的测试失败（亲和约束）；父 dispose 时子代在文档时限内 quiesce。  
退出：若没有 `subagents` 服务，Phase 3 能力保持未激活（主插件仍提供意图+档位）。

---

## 下一步

Phase 1 的第一个具体动作：把 `tianshu-public/packages/llm/llm-deepseek/src/spark.ts` 的 `truncateReasoningTail`（flash 尾 300 token）接到当前 harness 的 serialize 路径，并**同时**挂上丢失域锚点插件；然后把本仓 `SPARK_ALIASES` 从 `deepseek-official` 改到 `deepseek-spark`。没有截断的别名不要先合。

审查通过后，用 `writing-plans` 拆成可执行的 harness PR + 本仓两行别名 PR。
