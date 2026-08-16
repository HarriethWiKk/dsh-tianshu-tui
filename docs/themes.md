# 主题

内置 16 个调色板,`/theme` 随时切换(无参打开选择器,当前主题 ● 高亮),或
`/theme <name>` 直接指定。自定义主题:`/theme custom:<name>`。

## 内置主题

| 主题名 | 背景 | 描述 |
|---|---|---|
| `pastel` | 暗 | 温和粉彩。二次元风格启发,高对比、低饱和度多色卡。 |
| `cyberpunk` | 暗 | 赛博朋克。霓虹极高对比,酷炫亮眼。 |
| `observatory` | 暗 | 五色星辰。传统五行配色体系,天玑星君玄灰底色。 |
| `midnight` | 暗 | GitHub 暗黑风格。极简中性灰度,高度清晰。 |
| `starfield` | 暗 | 星空星座。Rivet 原生星图美学,天蓝主星与星云紫辅色。 |
| `tianshu` | 暗 | 玄夜墨色。95% 墨灰,配以星金主色与朱砂用户印,沉稳低调。 |
| `claude` | 暗 | Claude Code 官方 TUI 经典调色盘移植。橘黄经典。 |
| `ziwei` | 暗 | 帝星紫微。朱砂红标记点缀帝星紫,富含中国星图古典美学韵味。 |
| `slate` | 暗 | 冷静板岩灰。单一冷静 Teal 主色,无彩色结构,低眩光长久不累。 |
| `dawn` | 暗 | 启明星晨曦调。青蓝边框、暖金标题、雾灰正文,贴近 Tianshu 启动画面。 |
| `antigravity` | 暗 | Codex 风格。天青色冷调 Accent,亮灰结构文本,现代而克制。 |
| `cobalt` | 暗 | 钴蓝·冷调中性(默认风格)。oklch 调和,明度梯度清晰。 |
| `graphite` | 暗 | 石墨冰青(专业默认)。中性灰阶 + 单一冰青 accent,低饱和语义色。 |
| `gemini` | 暗 | Gemini 风格。星云微光渐变(冷靛蓝与星云紫)+ 极光薄荷。 |
| `paper` | 亮 | 纸白亮色。面向白底/浅色终端,全语义色加深降亮,靛蓝 accent。 |
| `light-ansi` | 亮 | 亮色 ANSI。16 色纯净版,跟随终端自身配色方案,亮背景友好。 |

## 终端检测与降级

- **自动检测**:启动时按终端能力(auto 主题检测)挑选暗/亮背景适配的主题。
- **16 色降级**:不支持真彩色的终端自动降级到 ANSI 16 色方案(语义色映射)。
- **ASCII 降级**:legacy 终端下 emoji 图标(`📁` 等)降级为 ASCII(`~`),宽度稳定。
- 任何终端宽度下渲染不破版:窄宽渐进丢次要段,极窄截断 model 段。

## 自定义主题

`/theme custom:<name>` 使用自定义调色板;主题定义位置与格式见
`src/theme-palettes.ts`(语义 token → 颜色值 + background + description)。
`description` 是 `/theme` 选择器的单一事实来源——新增主题必须带描述。

## 主题与可读性

- 语义色(primary/secondary/success/warning/error/dim/muted 等)保证工具卡、
  diff 红绿、审批卡、面板在任何主题下可读。
- 推理通道、轮次摘要、subagent 终态行等 dim 级信息在亮色主题下同样可辨。
