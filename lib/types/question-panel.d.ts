/**
 * 结构化提问面板（user-questions 数据面移植，纯函数层）。
 *
 * projectQuestionPanel 把 AskUserQuestionRequest 形状的提问投影为面板行：
 * 标题行 + 每个 question 一块。两种渲染形态：
 * - 通用选项面板：header 分隔行（可选）+ ❓ 问题行（multiSelect 尾缀
 *   「（多选）」）+ detail 缩进行（可选）+ 编号选项行（「n. label」，
 *   option.description 二级缩进）；
 * - plan-review 决策卡：🧭 问题行 + detail 缩进行（计划正文）+ 选项行按
 *   intent.approve 分类——命中的 label 标 ✓ 且 BOLD 高亮（批准项），其余
 *   标 ✗（否决项）；approve 不命中任何选项时全部按否决渲染（不吞异常、
 *   不伪造批准）；multiSelect 在决策卡形态不追加多选标记（裁决为单选）。
 * 数据面形状结构兼容 @deepseek-ai/dsh-user-questions 的
 * AskUserQuestionRequest/AskUserQuestionItem（intent 唯一 kind
 * 'plan-review' 带 approve: string），纯函数层不跨包依赖、无 I/O。
 * 空 questions 返回仅标题行；每行按显示宽度截断（仅截断时补 …，
 * 极端窄宽退化为 … 不抛错）。TuiApp 消费 user-questions 提供方的
 * request 快照（接线由其他维度独占）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/question-panel
 */
/** 单个可选项（结构兼容 user-questions 的 AskUserQuestionOption）。 */
export interface QuestionOptionInput {
    /** 用户可见标签。 */
    label: string;
    /** 可选附加说明（capable UI 渲染为二级缩进行）。 */
    description?: string;
}
/** 呈现意图（结构兼容 user-questions 的 AskUserQuestionIntent）。 */
export type QuestionIntentInput = {
    /** 计划评审：approve 命中的选项为批准项，其余为否决项。 */
    kind: 'plan-review';
    /** 批准选项的 label；未命中任何选项时全部按否决渲染。 */
    approve: string;
};
/** 单个问题（结构兼容 user-questions 的 AskUserQuestionItem）。 */
export interface QuestionItemInput {
    /** 稳定问题 id（面板不渲染，answers 定位用）。 */
    id: string;
    /** 要展示的问题。 */
    question: string;
    /** 可选附加说明（plan-review 卡中为计划正文）。 */
    detail?: string;
    /** 可选短标题/分组标签。 */
    header?: string;
    /** 可选选项列表；缺失则不渲染选项行。 */
    options?: QuestionOptionInput[];
    /** 是否可多选；缺省单选。plan-review 决策卡恒按单选裁决渲染。 */
    multiSelect?: boolean;
    /** 可选呈现意图；缺失渲染通用选项面板。 */
    intent?: QuestionIntentInput;
}
/** 提问请求（结构兼容 user-questions 的 AskUserQuestionRequest，只消费 questions）。 */
export interface QuestionRequestInput {
    /** 要展示的问题数组。 */
    questions: QuestionItemInput[];
}
/** 面板选项。 */
export interface QuestionPanelOptions {
    /** 终端列数（行截断预算，含标题行）。 */
    width: number;
}
/**
 * 投影提问请求为面板行（标题 + 每个 question 一块，按输入顺序）。
 * @param request - 提问请求（只消费 questions 字段）。
 * @param opts - 面板选项（行宽预算）。
 * @returns 面板行数组（空 questions → 仅标题行）。
 */
export declare function projectQuestionPanel(request: QuestionRequestInput, opts: QuestionPanelOptions): string[];
