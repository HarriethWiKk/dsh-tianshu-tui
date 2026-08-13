/**
 * mention-parser — @路径展开解析器（RED 基线）。
 *
 * 纯函数：输入文本 + 光标 → 光标处的候选 @token（含 span/value/引号态）。
 * 不读文件——文件内容摘要展开由装配层（后续）接线。
 *
 * token 形：裸 `@path` 与引号形 `@"a b.ts"`（路径含空格/反斜杠时）。
 */
/** 光标处的候选 @token（span 覆盖 @ 起始到 token 结束，引号形含闭合引号）。 */
export interface MentionToken {
    /** 起始偏移（@ 所在）。 */
    start: number;
    /** 结束偏移（不含；引号形在闭合引号之后）。 */
    end: number;
    /** 去引号后的路径值。 */
    value: string;
    /** 引号形 token（路径含空格）。 */
    quoted: boolean;
}
/** mention 分类：file / folder（尾斜杠）/ symbol（含 #/::）/ raw（空值）。 */
export type MentionKind = 'file' | 'folder' | 'symbol' | 'raw';
/** 带分类的 mention token（parseMentions 输出）。 */
export interface MentionReference extends MentionToken {
    kind: MentionKind;
}
/**
 * 光标处候选 @token：光标在 token 内/末尾/@ 上视为编辑中；其余 null。
 * @param input - 输入框全文。
 * @param cursor - 光标偏移（越界返回 null）。
 * @returns 候选 token；光标不在任何 token 上返回 null。
 */
export declare function findMentionAt(input: string, cursor: number): MentionToken | null;
/**
 * 全量提取所有 mention token（裸 + 引号形）。
 * @param input - 输入框全文。
 * @returns 带分类的 token 列表（引号形优先，裸形跳过已被引号形消费的区域）。
 */
export declare function parseMentions(input: string): MentionReference[];
/**
 * token 形状启发式分类：尾斜杠 → folder；含 #/:: → symbol；空 → raw；其余 file。
 * @param value - 去引号后的路径值。
 * @returns 分类结果。
 */
export declare function mentionKind(value: string): MentionKind;
