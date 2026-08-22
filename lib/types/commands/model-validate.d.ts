/**
 * /model 目录校验与一键别名（回流 tianshu 8cc0cbe589）。
 *
 * 分级遵守 llm 目录的 advisory 契约（types.d.ts「catalog membership is
 * advisory, not request validation」——目录缺失不得变成请求拒绝）：
 * - provider 未注册（权威事实，请求注定派发失败）→ 硬拒绝并列已注册路由
 * - 目录非空而模型在目录外 → 硬拒绝 + 至多三条就近建议（不自动纠错）
 * - 目录为空（adapter 未通告/通告失败）无法证伪 → 放行；llm 未装配 → 跳过校验
 *
 * @module @deepseek-ai/dsh-tianshu-tui/commands/model-validate
 */
/** /model 校验所需的 llm 目录最小服务面（不引入 dsh-llm 依赖；reflect.get 动态获取）。 */
export interface LlmCatalogFacet {
    listProviders(): Array<{
        id: string;
    }>;
    listModels(provider: string): Promise<Array<{
        id: string;
    }>>;
}
/** 路由选择投影（ModelSelection 的 provider/model 段）。 */
export interface RouteSelection {
    provider: string;
    model: string;
}
/**
 * /model 一键切换别名（TUI 便捷层）：展开为已注册的 deepseek-official
 * 路由 + 官方 wire 模型 id。官方 API 没有 spark 模型名，也没有
 * deepseek-spark provider；别名只是 flash/pro 的快捷写法。
 */
export declare const SPARK_ALIASES: Readonly<Record<string, RouteSelection>>;
/**
 * /model 的就近建议：大小写不敏感的精确 → 前缀 → 子串匹配，去重封顶 3 个。
 * 只做提示，不做自动纠错（纠错会掩盖 advisory 目录的边界）。
 * @param input - 用户输入的模型名。
 * @param catalogIds - 目标 provider 通告目录里的模型 id 列表。
 * @returns 相近模型 id（catalog 原序），无相近时为空数组。
 */
export declare function suggestModels(input: string, catalogIds: readonly string[]): string[];
/**
 * 目录分级校验：通过返回 null；拒绝返回完整回显行（点名当前选择，不切换）。
 * @param llm - llm 目录服务（reflect.get 动态获取）；undefined = 未装配，跳过校验。
 * @param next - 待保存的目标路由。
 * @param current - 当前生效路由（拒绝时点名）。
 * @returns 拒绝回显行；null = 校验通过（或无法证伪/跳过）。
 */
export declare function validateModelSelection(llm: LlmCatalogFacet | undefined, next: RouteSelection, current: RouteSelection): Promise<string | null>;
