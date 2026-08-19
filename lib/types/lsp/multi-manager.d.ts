/**
 * Multi-language LSP manager（移植自天枢 Tianshu src/lsp/multi-manager.ts，
 * Apache-2.0；spawn 路径简化：dsh-tui 是纯 Node 进程，弃上游 spawnHidden /
 * resolve-node-cli 桌面 bundle 适配，用 node:child_process spawn 直连）。
 *
 * Wraps the single-server `createLspManager` and routes each request to the
 * language server matching the file's extension, lazily spawning + initializing
 * each server on first use. This gives polyglot go-to-definition / diagnostics
 * (pyright / gopls / rust-analyzer / clangd / jdtls / typescript-language-server)
 * behind the existing single `LspManager` interface.
 */
import { type ChildProcess } from 'node:child_process';
import { type LspManager } from './manager.js';
import { type LspServerDef, type WhichFn } from './server-registry.js';
export interface MultiLspOptions {
    which?: WhichFn;
    /** Injected for tests; defaults to a real child-process spawn. */
    spawnFor?: (def: LspServerDef, cwd: string) => ChildProcess;
}
type LspSpawnFn = (cmd: string, args: string[], opts: Record<string, unknown>) => ChildProcess;
/**
 * Default spawn for LSP servers: plain child_process.spawn (non-win32).
 * Windows 上 npx 与 npm 全局装的 langserver 都是 .cmd，不经 shell 直接
 * spawn 抛 EINVAL（CVE-2024-27980 后行为）——win32 经 ComSpec（cmd.exe）
 * /d /c 以 argv 数组显式派发，同 self-update 的包管理器派发；shell 保持
 * false，避开 DEP0190 弃用警告渲染进 TUI。command/args 均来自仓内
 * server-registry 固定表，无用户输入，无注入面。
 */
export declare function defaultLspSpawn(def: LspServerDef, cwd: string, spawnFn?: LspSpawnFn): ChildProcess;
export declare function createMultiLspManager(cwd: string, opts?: MultiLspOptions): LspManager;
export {};
