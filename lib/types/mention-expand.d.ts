/**
 * mention-expand — @mention 用户侧摘要展开（Phase 9a 装配层）。
 *
 * 语义决策（.agents/notes/implemented/feature/2026-08-10-tui-mention-semantics.*）：
 * `@filename` 展开为截断的内容摘要展示在用户消息中，**不做** agent 上下文注入。
 * 读取边界：仅限工作区（cwd）内文件；目录/不存在/越界 → 降级为引用名展示
 * （token 原样保留，不展开）。摘要截断（首 20 行 / 4KB）加折叠标记。
 *
 * 文件读取在 file 边界做存在性与大小验证（AGENTS.md 边界验证纪律）：
 * 先 resolve + 前缀校验（防越界），再 stat 存在性/类型，读取后截断。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/mention-expand
 */
/**
 * 展开输入中的所有 @mention：file 类 token 读 cwd 内文件内容摘要，
 * 替换为 `@path\n<摘要>`；folder/越界/不存在/读取失败 → token 原样保留。
 * @param input - 输入文本。
 * @param cwd - 工作区根（读取边界）。
 * @returns 展开后的文本。
 */
export declare function expandMentions(input: string, cwd: string): string;
