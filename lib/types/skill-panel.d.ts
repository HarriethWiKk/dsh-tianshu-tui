/**
 * 技能浏览面板（skill 数据面移植，纯函数层，T3.3）。
 *
 * projectSkillPanel 把 SkillSummary 形状的快照投影为面板行：
 * - 列表行：每个 skill 一行「name · description · 来源标记」——来源标记按
 *   SkillSource 已知值映射短标签（项目 .dsh / 项目 AGENTS / 运行时 / 用户
 *   .dsh / 用户 AGENTS / 自定义 / 内置），未知来源回退渲染原值；
 * - 选中详情：opts.selected 命中的 skill 在其列表行后追加一行
 *   「└ provider · 调用形态 · whenToUse」（whenToUse 缺省时省略该段）——
 *   调用形态由 invocation.modelInvocable/userInvocable 组合推导
 *   （模型+用户可调 / 仅模型可调 / 仅用户可调 / 不可调），selected 未命中
 *   或缺省不渲染详情行。
 * 数据面形状结构兼容 @deepseek-ai/dsh-skill 的 SkillSummary（纯函数层只消费
 * name/description/whenToUse/invocation/source/provider；resourceBase 不参与
 * 渲染），skills/change 无 payload 事件、刷新靠重查，面板层只消费 list 快照
 * 投影。空列表渲染标题 + 空态占位；每行按显示宽度截断（仅截断时补 …，
 * 极端窄宽退化为 … 不抛错）。TuiApp 消费技能快照与 /skills 命令切换显隐
 * （接线由其他维度独占）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/skill-panel
 */
/** 调用控制（结构兼容 dsh-skill 的 SkillInvocationPolicy）。 */
export interface SkillInvocationInput {
    /** 模型面是否可调用。 */
    modelInvocable: boolean;
    /** 用户面是否可调用。 */
    userInvocable: boolean;
}
/** skill 摘要（结构兼容 dsh-skill 的 SkillSummary，纯函数层只消费路由字段）。 */
export interface SkillSummaryInput {
    /** kebab-case 技能标识。 */
    name: string;
    /** 短路由描述。 */
    description: string;
    /** 可选额外路由指引（选中详情行消费）。 */
    whenToUse?: string;
    /** 模型/用户调用控制。 */
    invocation: SkillInvocationInput;
    /** 发现来源（SkillSource）；未知值回退渲染原值。 */
    source: string;
    /** 拥有该 skill 的提供方标签。 */
    provider: string;
}
/** 面板选项。 */
export interface SkillPanelOptions {
    /** 终端列数（行截断预算，含标题行）。 */
    width: number;
    /** 选中的 skill 名称；命中的 skill 追加详情行；缺省/未命中不渲染详情。 */
    selected?: string;
}
/**
 * 投影技能快照为面板行（标题 + 列表行 + 命中的选中详情行）。
 * @param skills - skill 摘要数组；空数组 → 标题 + 空态占位。
 * @param opts - 面板选项（行宽预算 + 可选选中名）。
 * @returns 面板行数组。
 */
export declare function projectSkillPanel(skills: SkillSummaryInput[], opts: SkillPanelOptions): string[];
