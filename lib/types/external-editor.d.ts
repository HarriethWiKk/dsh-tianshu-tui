/**
 * external-editor — 外部编辑器集成（Phase 6.4）。
 *
 * Ctrl+E（可配 editorKey；ctrl+o 已恢复为推理展开）把当前输入行内容写入
 * 临时文件，spawn `$VISUAL || $EDITOR` 打开编辑，保存退出后内容回填输入框。
 * 纯 Node API，零依赖。
 *
 * 移植自 .rivet/tui-source/tui/external-editor.ts（Apache-2.0；SOURCE-MAP.md）。
 * 差异：源引用的 ../platform.js getDefaultEditor 未随移植源落地，此处内联
 * （VISUAL/EDITOR 优先，缺省 vi / notepad@win32）。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/external-editor
 */
/**
 * 平台缺省编辑器（VISUAL/EDITOR 均未设置时）。
 * @returns win32 为 notepad，其余平台为 vi。
 */
export declare function getDefaultEditor(): string;
/**
 * 编辑器命令：VISUAL 优先，其次 EDITOR，最后平台缺省。
 * @param env - 环境变量来源（测试可注入；缺省 process.env）。
 * @returns 要 spawn 的编辑器命令。
 */
export declare function getEditorCommand(env?: NodeJS.ProcessEnv): string;
/**
 * 把初始内容写入一次性临时文件（目录 mkdtemp，文件 RIVET_INPUT.md）。
 * @param content - 写入的初始内容。
 * @returns 临时文件的绝对路径。
 */
export declare function createTempFile(content: string): string;
/**
 * 读取编辑结果并清理临时目录（文件与 mkdtemp 目录一并删除；失败 best-effort）。
 * @param path - createTempFile 返回的临时文件路径。
 * @returns 文件内容（utf-8）。
 */
export declare function readAndCleanup(path: string): string;
/** openInEditorDetailed 的结果：内容与启动异常原因分离（P1-1 失败回显用）。 */
export interface EditorRunResult {
    /** 编辑后的内容；编辑器启动/执行异常时为 null。 */
    content: string | null;
    /** 启动/执行异常信息（spawn error.message）；正常路径为 null。 */
    error: string | null;
}
/**
 * 打开编辑器编辑 initialContent，返回内容与异常原因。
 * 编辑器命令可注入（测试）；缺省走 getEditorCommand()。
 * 编辑器异常终止（status !== 0 且有 error）时 content 为 null、error 携带
 * spawn 原因；status 非 0 但无 error（编辑器被信号终止但文件已保存）仍读回内容。
 * @param initialContent - 预填进编辑器的初始内容。
 * @param editor - 编辑器命令（测试注入）；缺省走 getEditorCommand()。
 * @returns 内容与异常原因（内容为 null 当且仅当编辑器启动/执行异常）。
 */
export declare function openInEditorDetailed(initialContent: string, editor?: string): EditorRunResult;
/**
 * 打开编辑器编辑 initialContent，返回编辑后的内容。
 * 兼容薄包装：失败（启动/执行异常）返回 null；原因经 openInEditorDetailed 获取。
 * @param initialContent - 预填进编辑器的初始内容。
 * @param editor - 编辑器命令（测试注入）；缺省走 getEditorCommand()。
 * @returns 编辑后的内容；编辑器启动/执行异常时为 null。
 */
export declare function openInEditor(initialContent: string, editor?: string): string | null;
