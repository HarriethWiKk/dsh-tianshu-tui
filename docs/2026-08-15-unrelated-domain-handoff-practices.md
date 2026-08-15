# 跨领域交接实践（与 Spark / 内核无关）

日期：2026-08-15  
形态：独立研究备忘（deep-brainstorm Step 0）。不是架构决策，不替代设计规格。

对照对象（检索词里未出现）：长过程把一小段交给下一阶段，全文另存或丢掉，丢掉的部分用第二通道补偿。本文件找的是**同构机制**，不是产品方案。

---

## 1. 这份资料是什么 / 不是什么

**是**

- 网上可核对的领域机制：谁在什么场景做什么、完整记录在哪、下一阶段只拿走什么、丢掉的如何补偿、URL。
- 三路只读检索合成的交叉假设，加一路只做反证的隐含前提清单。
- 给设计规格用的短对照表：只写可执行动作。

**不是**

- 不是 Phase 1–3 的实现计划，不改 harness / TUI 代码。
- 不替代 [设计规格](../specs/2026-08-15-dsh-kernel-collab-design.md)，不重写 ESI / 空管，不展开 Galaxy / 意图路由。
- 不把类比写进架构结论。某领域失败 ≠ 某软件该怎么做。

检索避开：spark / dsh / moe / cordis / 意图路由 / 协同 / 工作流 / 思维链 / 截断 / token。也不重复 ESI、空管。

子代理：

| 路 | 领域 | 状态 |
|----|------|------|
| 法庭 / 黑匣 / 卡尔曼 | CVR、判例 holding、卡尔曼 | 完成 |
| 编译器 / TCP / 精馏 | SSA live-out、SACK、常减压塔 | 完成 |
| 演练 / 组装 / 末段 / 负发现 | AAR、k-mer、末段录像、NTSB 排除项 | 完成 |
| 反证 | 只攻击「下一阶段只看尾段」的隐含前提 | 完成；禁止找支持证据 |

超时则标「信息不足」。本轮无超时编造。

---

## 2. 已有对照（不重写）

急诊 ESI 只升不降、空管双通道移交（先 ACK 再卸责、UNABLE 则所有权不转移）已写在设计规格的 Scout B 与空管对照表里。本文件不复述。

---

## 3. 按领域：人-场-动-果

每节同一骨架：**人-场-动-果** → 完整记录在哪 → 下一阶段只拿走什么 → 丢掉的如何补偿 → URL。

### 3.1 航空 CVR（循环覆盖）

**人-场-动-果：** 调查组在事故或报告事件后，从抗坠毁循环存储器取出断电或拉断路器那一刻往前的最后一段驾驶舱音频，做成与 FDR、空管录音对时的誊本；更早音频已被覆盖。

- **完整记录：** CVR **不**另存全航段语音。参数侧 FDR 法定约 25 小时循环；QAR 把同一数据流另存到易拆介质。地面另有空管录音、雷达。CVR 原声按 49 U.S.C. § 1114(c) 不得公开；认定相关的誊本才进公开卷宗。
- **下一阶段拿走：** 断电/拉断前最后一段。磁带时代约 30 分钟；其后至少最后 2 小时；ICAO/EASA 对 2021 年后新造、MTOW >27 000 kg 的商用机要求最后 25 小时；FAA 于 2026-02-02 把新制造机最低时长从 2 小时改为 25 小时。仍是滚动覆盖，不是全寿命档案。
- **丢掉的如何补偿：** FDR 话筒按键、空管时码、声谱交叉相关把 CVR 相对时间钉到当地时；缺口用 FDR、空管、访谈、残骸补。保全动作是落地后立即拉断路器。飞机继续通电则循环继续擦——Northwest 188、Alaska 1282 都把**事件本身**覆盖掉。

URL：

- https://www.govinfo.gov/content/pkg/FR-2026-02-02/html/2026-02110.htm
- https://www.ntsb.gov/investigations/AccidentReports/Reports/ASR1804.pdf
- https://skybrary.aero/articles/cockpit-voice-recorder-cvr
- https://www.law.cornell.edu/uscode/text/49/1114

### 3.2 英美判例（holding vs 誊本）

**人-场-动-果：** 后案法院只绑定前案「对裁判必要的法律规则 + 被当作材料事实的那些事实」（holding / ratio decidendi）；庭审誊本和 dicta 不随先例走。

- **完整记录：** 誊本 + 诉状 + 证物构成 record on appeal，留在原审书记官处。上诉原则上只审这份记录。
- **下一阶段拿走：** 公布意见里的 holding / ratio。多数法域用必要性检验：拿掉这句话结果仍成立 → dicta，不绑定。Goodhart：原则 = 法官视为材料的事实 + 据此判决，不在意见书的修辞句里。
- **丢掉的如何补偿：** 同案：事实没进 record，上诉几乎主张不了（补正、发回、FRAP 10(c) 重建）。后案：必须在**自己的**庭审记录里重新证明；要用先例就主张材料事实相同，要躲开就 distinguish。意见省略的细节推定非材料，后案不得把全记录加回去当拘束。

URL：

- https://www.law.cornell.edu/rules/frap/rule_10
- https://lawschooltoolbox.com/whats-the-difference-between-holding-and-dicta-in-a-case/
- https://chicagounbound.uchicago.edu/cgi/viewcontent.cgi?article=6204&context=uclrev
- https://www.open.edu/openlearn/society-politics-law/law/judicial-decision-making/content-section-9.1

### 3.3 卡尔曼滤波（状态 + 协方差）

**人-场-动-果：** 在线性高斯模型下，滤波器每步只把状态均值 \(\hat{x}\) 和误差协方差 \(P\) 交给下一时刻；原始观测序列不必留下即可做最优滤波。

- **完整记录：** 纯滤波不另存观测。若还要平滑（Rauch–Tung–Striebel），前向必须另存整条 \(\{(\hat{x}_k,P_k)\}\)（或保留全部 \(z\) 再跑一遍）。
- **下一阶段拿走：** \((\hat{x}, P)\)，或信息形式 \(I=P^{-1}\)、\(\iota=P^{-1}\hat{x}\)。
- **丢掉的如何补偿：** 过程噪声在预测里记 \(P\leftarrow FPF^{\top}+Q\)。观测信息折进 \(I\) 后 \(z\) 可丢。**前提是线性+高斯**：此时 \((\hat{x},P)\) 才是后验充分统计。非线性/非高斯时充分统计是整条条件密度；粒子滤波保留加权粒子云。把云压成一对矩，会把质量放在双峰之间的谷底。

URL：

- https://en.wikipedia.org/wiki/Kalman_filter
- https://www.cs.cmu.edu/~motionplanning/papers/sbp_papers/kalman/welch_intro_kalman.pdf
- https://www.cs.ubc.ca/~murphyk/Software/Kalman/ParticleFilterTutorial.pdf

### 3.4 编译器 SSA / liveness

**人-场-动-果：** 编译器在基本块/函数出口，只把后续还可能被读的 live-out 交给下一遍，把不再影响输出的赋值删掉；源级对应关系改由调试旁路补。

- **完整记录：** 可执行码里死赋值被删。源映射另存为 DWARF `.debug_loc` 位置表 / LLVM `#dbg_value`，按 PC 区间有效。
- **下一阶段拿走：** `LIVE_out[s] = ∪ LIVE_in[后继]`。函数出口块 `LIVE_out[final] = ∅`（返回值/逃逸存储另计）。时间上「最后一次赋值」可以被 KILL；出口仍活的不必是源文件末尾那几个名字。
- **丢掉的如何补偿：** 操作数无法恢复时写入 poison/kill location，调试器显示 `<optimized out>`，不把旧值假装还在。空位置表 = 源里有、码里没有。`DW_OP_entry_value` 可从调用点重建入参。

URL：

- https://en.wikipedia.org/wiki/Live-variable_analysis
- https://llvm.org/docs/SourceLevelDebugging.html
- https://dwarfstd.org/doc/040408.1.html

### 3.5 TCP 滑动窗口 / SACK

**人-场-动-果：** 接收端只用窗口状态（下一期望序号、窗口大小、已排队的非连续块）决定收不收、怎么确认；已确认左侧的历史报文不再参与下一动作。

- **完整记录：** 发送端必须把数据留到累积 ACK 覆盖后才能释放。SACK 是咨询性的，接收方允许 renege（丢掉已 SACK 但未累积确认的数据）。
- **下一阶段拿走：** `RCV.NXT`（窗口左沿）、`RCV.WND`、SACK 块左右沿。序号小于 `RCV.NXT` 的是已确认旧序号，实现里 TrimFront 后丢弃。
- **丢掉的如何补偿：** 发送端按 SACK 缺口重传「未 SACK 且小于最高 SACK」的洞；超时则清掉 SACK 位并重传窗口左沿。不重放全部历史。

URL：

- https://www.rfc-editor.org/rfc/rfc9293.html
- https://www.rfc-editor.org/rfc/rfc2018.html
- https://www.rfc-editor.org/rfc/rfc3517.html

### 3.6 石油精馏（塔顶 / 塔底）

**人-场-动-果：** 炼厂在常压塔把原油按沸点切开；下一装置只拿走对应沸程的那一股，塔底常渣不进轻油装置。

- **完整记录：** 原油在进料端被切开，不是「丢掉」——重组分作为另一股进料。
- **下一阶段拿走：** 塔顶石脑油（加氢 → 重整）；侧线煤油 / 常压瓦斯油。重整不吃整锅原油，也不吃塔底。
- **丢掉的如何补偿（工艺，不是口号）：** 常渣再加热进减压塔；减压渣油走溶剂脱沥青、减粘或延迟焦化。下一工序只接收本沸程馏分，重组分另路转化。

URL：

- https://courses.ems.psu.edu/fsc432/node/534
- https://courses.ems.psu.edu/fsc432/node/589

### 3.7 美军 AAR / 教训学习

**人-场-动-果：** 刚打完一仗（或 CTC 轮训）的分队现场做四问讨论；交给下一分队的不是整场口述，而是 RIP/TOA 要点 + continuity book；机构记忆另进 CALL/JLLIS。

- **完整记录：** After Action **Report** 才是入库件。CALL 写明：单位级讨论会随人员轮换流失；机构学习靠把报告送进中央档案。
- **下一阶段拿走：** 四问要点（本应发生 / 实际发生 / 对错 / 下次怎么做）；RIP 清单（障碍物与移交时刻、补给转交、指挥权触发事件、共同图形与通信）。
- **丢掉的如何补偿：** 讨论当场用己方 / OPFOR / OC 多视角补时间轴；未达标即时复训；其他单位用 CALL RFI 查档案。不交 AAR 就不会进全军库——制度以此为前提。具名「未入库 → 下一分队同坑」的公开配对：**信息不足**。

URL：

- https://www.globalsecurity.org/military/library/policy/army/fm/25-101/fm251_13.htm
- https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN34075-PAM_11-33-000-WEB-1.pdf
- https://www.army.mil/CALL
- https://www.darpa.mil/news/2021/continuity-knowledge-rotations-replacements

### 3.8 基因组 k-mer / 重叠群组装

**人-场-动-果：** 测序仪产出整条短 read 后，组装器下一阶段不拿整条 read 做两两重叠，而是切成固定长度 k-mer 建 de Bruijn 图走欧拉路径，得到 contig。

- **完整记录：** 原始 read 仍在测序档案。图本身不再 read-coherent：同一 read 里两个 k-mer 的「同读本绑定」消失。
- **下一阶段拿走：** 唯一 k-mer 与 (k−1) 重叠边。短 k 覆盖密但重复区岔路多；长 k 更像唯一地址但图易碎。IDBA 从小 k 迭代到大 k：小 k contig 当伪 read 喂大 k 图。
- **丢掉的如何补偿：** 配对末端 / mate-pair 用已知插入距离把两个唯一锚定 contig 锁成脚手架，跨过比 k 更长的重复。不把整条 read 塞回图。长于 read 的重复，没有第二通道就停在重复边界。

URL：

- https://pmc.ncbi.nlm.nih.gov/articles/PMC6061703/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC3216098/
- https://i.cs.hku.hk/~chin/paper/IDBA-Recomb2010.pdf

### 3.9 比赛末段录像（two-minute / L2M）

**人-场-动-果：** 教练组或裁判办公室不拿开场当默认教材，只剪「时钟规则已经换挡」的末段；完整比赛带仍按 All-22 存在球队服务器，末段是索引切出来的视图，不是原带被覆盖。

- **完整记录：** 每队从边线（All-22）和端区拍全程，赛后按进攻/防守/特勤拆带进球队服务器；副本给 NFL Films。NBA L2M 是公开裁判评估表，完整转播带另存。
- **下一阶段拿走：** 两分钟警告之后的时钟规则窗口（出界停表、10 秒 runoff、禁 sack 等只在这套规则里才成为可评分事件）。NBA L2M 只评估「第四节（及加时）最后两分钟里分差曾到 3 分以内」的哨。
- **丢掉的如何补偿：** 完整带回答「这套节奏是不是整场都这样」；末段带只回答「规则换挡之后还能否执行」。ESPN：末两分钟三人外接手 82%（全场 61%）、play-action 3%（全场 24%）——末段不是全场的充分统计。具名「只看末段而教错开场」的场次：**信息不足**。

URL：

- https://static.www.nfl.com/image/upload/fl_attachment/league/tqivdkzt9mu6wdgsh1ku.pdf
- https://official.nba.com/2025-26-nba-officiating-last-two-minute-reports/
- https://www.espn.com.au/nfl/story/_/id/42508173/nfl-2024-two-minute-drill-game-winning-drives-offense-keys

### 3.10 事故调查负 Findings（摘要必须带排除项）

**人-场-动-果：** 调查组把能想到的致因都跑一遍；最终报告在 probable cause 之前，用专节和编号 Findings 写明「下列各项不是因素」。

- **完整记录：** 事实卷宗、残骸、试验另存。公开报告是压缩件。
- **下一阶段拿走：** probable cause **加上**已排除清单。HAR-20/01 Findings 第 1 条：驾照、路熟、医疗/疲劳/酒精、天气——none of the following were factors。TWA 800 先列三类假说，再列 Very Unlikely Ignition Sources，然后才给最可能点火路径。
- **丢掉的如何补偿：** 把已证伪路径写成可审计负清单，后来者不必重跑同一组检验。证据不足也必须写出来（不能认定的不升格为原因）。排除项**不会**自动出现在任何摘要里——必须单独成节。

URL：

- https://www.ntsb.gov/investigations/accidentreports/reports/har1702.pdf
- https://www.ntsb.gov/news/events/documents/moriches_ny-TWA_800_Overview.pdf
- https://www.ntsb.gov/news/press-releases/Pages/NR20190221.aspx

---

## 4. 交叉假设 + 反证前提

分层标记：**事实** = 可核对的领域规则/事故；**现状** = 当前法规或教材表述；**惯例** = 行业做法但非硬性法条；**假设** = 从多域归纳、尚未被本文件当作设计结论。

### 4.1 交叉假设（合成后、反证前）

| ID | 层级 | 假设 |
|----|------|------|
| H1 | 假设 | 下一阶段只需要被丢掉前段的**充分统计**（\(\hat{x}+P\)、live-out、窗口左沿、holding）。 |
| H2 | 假设 | 关键事件总在保留窗口内，所以循环覆盖只留尾段够用。 |
| H3 | 假设 | 丢掉的前段总有 sidecar，且 sidecar 在尾段不够时一定会被查。 |
| H4 | 假设 | 压缩件会带走区分所需的材料事实。 |
| H5 | 假设 | 「时间尾 / 最后 N」等于「下一阶段仍需要的集合」。 |
| H6 | 假设 | 排除项会自动出现在任何摘要里。 |
| H7 | 假设 | 末段视图可以替代全场。 |

更短的交叉句（仍是假设，不是规格）：

> 消费面 = 活前沿；历史面 = 删除或旁路另存；缺口用第二通道补，不重放全部历史。  
> 「只留时间尾」只是活前沿的一个特例——当且仅当近因 ≈ 仍被使用。

### 4.2 反证（只找反例；禁止支持证据）

| 前提 | 判定 | 依据（事实 / 现状） |
|------|------|-------------------|
| P1 / H1 充分统计 | **证伪** | 事实：非线性滤波 \((\mu,\Sigma)\) 只在线性高斯下充分；立方传感器无有限维充分统计；EKF 在双峰上把估计放在谷底。 |
| P2 / H2 事件总在窗口内 | **证伪** | 事实：Northwest 188 关键讨论被覆盖，剩余约 13 分钟不含该事件；Alaska 1282 事故飞行音频全被地面作业覆盖；NTSB：2018 年以来至少 14 起调查因 CVR 覆盖受阻。 |
| P3 / H3 sidecar 一定可查 | **证伪** | 现状：49 U.S.C. § 1114(c) 禁止公开 CVR 原声；誊本可错、可不全。事实：*Roberts v. Ferman* 六天丢四天誊本，剩余两天无法审查；Alaska 1282 有约 68 小时 FDR 仍补不上被覆盖的驾驶舱原声。 |
| P4 / H4 材料事实随压缩件走 | **证伪** | 现状：Goodhart——意见省略的事实推定非材料；后案用丢掉的细节 distinguish。惯例：restrictive distinguishing 可改写 ratio 宽窄。 |
| P5 / H5 时间尾 ≡ 活变量 | **证伪** | 现状：live-out ≠ 源文件末尾赋值；TCP `seq < RCV.NXT` 的前缀被丢，当前窗口不是已交付历史。 |
| P6 / H6 排除项自动出现 | **削弱** | 惯例：轮换流失、AAR 易腐、同类错误反复（Military Review / DARPA KMASS / HSAJ）。具名「未入库 → 下一分队同坑」公开配对：**信息不足**。 |
| P7 / H7 剪尾可替代全场 | **削弱** | 事实：末两分钟与全场的人员/play-action/垂直路线分布可测地不同。具名「只看末段而教错开场」场次：**信息不足**。 |

### 4.3 反证之后仍站得住的机制句

这些是**被反例收窄后**的机制，不是产品建议：

1. 下一阶段拿走的应是**仍会被用的前沿**（live-out / 窗口左沿 / 本沸程馏分 / holding+材料事实），不是「源文件或时间轴的末尾」。
2. 时间尾循环覆盖会在「事件不在窗口内、且过程继续」时失败；保全要靠**停止覆盖**（断电/拉断），不是靠窗口本身。
3. 充分统计有模型条件；条件不成立时必须保留更完整的表示（粒子云、全密度、全文）。
4. 旁路全文与传输通道是两条路：誊本不进先例、原声不公开、FDR 补不上 CVR 语音。另存 ≠ 会被查到。
5. 排除项必须**单独写成可审计清单**；讨论纪要不入库就会随人员走。
6. 缺口用第二通道按**洞**补（SACK、mate-pair、多视角），不重放全部历史；没有第二通道就停在边界（重复区、`<optimized out>`、undetermined）。

---

## 5. 给设计规格用的短对照表

只写可执行动作。打开本表应能复述，不必翻 400 行规格。不改 Phase 1–3。

| 动作 | 领域来源 | 反证收窄 |
|------|----------|----------|
| 下一请求只带仍会被用的那一段；全文另存，不 mutate 原件 | SSA live-out；TCP 左沿；卡尔曼 \((\hat{x},P)\)；精馏只拿走本沸程 | 时间尾 ≠ 活前沿。线性高斯不成立时一对矩不够。 |
| 丢掉的头段必须留下排除项，不能只删不标 | NTSB negative findings；DWARF `<optimized out>` | 排除项不会自动出现；AAR 不入库则流失。 |
| 旁路档案与传输件分开：传输件不够时，按规则去查旁路，旁路依法不可用就标不可用 | 誊本 vs holding；All-22 vs cut-up；QAR vs CVR 原声 | sidecar 存在 ≠ 可查。原声禁止公开、誊本缺失则主张不了。 |
| 缺口按洞补，不重放全部历史 | TCP SACK；k-mer mate-pair；CVR 与 FDR 对时 | 没有第二通道就停在边界，不假装连续。 |
| 循环覆盖要有停止覆盖的动作，否则事件本身会被擦掉 | CVR 拉断路器；发送缓冲直到累积 ACK | Northwest 188 / Alaska 1282：继续通电 = 覆盖事件。 |
| 压缩件必须带走区分所需的材料事实；被省略的细节不得事后假装仍有拘束 | holding + 材料事实；Goodhart | 后案靠丢掉的细节 distinguish。 |
| 下一工序不把重组分混进轻油路径；另股走另路 | 常渣 → 减压 / 焦化 | — |
| 末段规则窗口与全场倾向分开存、分开用 | NFL 两分钟规则 vs All-22；NBA L2M | 末段分布与全场不同；只看末段会学成错误默认。 |

最小可复述的 8 条：

1. 下一请求只带尾段（或活前沿），全文另存。
2. 丢掉的头段必须留下排除项。
3. 另存的全文与传输件分通道；查不到就标不可用。
4. 缺口按洞补，不重放历史。
5. 覆盖循环必须能停；不停就会把事件擦掉。
6. 压缩件要带材料事实；省略的细节无拘束。
7. 另一股物料走另一条路径，不混进当前装置。
8. 规则已换挡的窗口与全场档案分开用。
