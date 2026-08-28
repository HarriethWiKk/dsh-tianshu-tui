/**
 * 输入历史持久化 — ~/.dsh-tui/input-history.json（上游 Tianshu history.ts 模式移植）。
 *
 * 语义（对本仓内存态的持久化版，去重更强）：
 * - trim 后空串 no-op；对全列表去重（重复提交浮到头部）；上限 MAX_INPUT_HISTORY。
 * - 追加 = 进程内串行队列 + 每次重读合并再原子写：快速连续提交不丢条目；
 *   多进程并发按 last-writer-wins（原子写保证文件永不损坏，仅可能互相覆盖）。
 * - 容错：损坏/缺失 → 空历史；写失败静默（历史是优化不是正确性依赖）。
 * - 隐私注记（docs/configuration.md）：文件内容为用户输入原文，删文件即清空。
 *
 * @module @huiliyi37/dsh-tianshu-tui/input-history
 */
export declare const MAX_INPUT_HISTORY = 1000;
export declare function defaultInputHistoryPath(): string;
/** 读历史；缺失/损坏/非字符串数组 → 空历史。 */
export declare function loadInputHistory(path: string): string[];
/** 提交后的下一份历史（纯函数）：trim、空串 no-op、全列表去重、限长。 */
export declare function nextHistoryAfterSubmit(history: readonly string[], entry: string): string[];
/**
 * fish 式历史建议（ghost）：最近一条以 value 为前缀的历史条目的剩余部分。
 * 历史按最近在前排列，首个匹配即最近条目；等长（无剩余）与剩余部分含换行
 * 的条目跳过（ghost 只渲染在光标行尾，多行建议无意义）。空 value → null。
 */
export declare function historyGhostSuffix(history: readonly string[], value: string): string | null;
/**
 * 追加一条输入历史（异步，不阻塞调用方——提交路径延迟敏感）。
 * 每次都重读文件再合并：多会话/多进程下的最新文件状态优先，本进程新条目置顶。
 */
export declare function appendInputHistory(path: string, entry: string): Promise<void>;
/** 测试密封门（同 prefs.ts）：VITEST 下默认 null，显式 path 优先。 */
export declare function inputHistoryEnabled(explicitPath: string | null | undefined): string | null;
