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
 * Default spawn for LSP servers: plain child_process.spawn. The TUI runs in a
 * normal Node process whose PATH carries npx (the CLI is launched via
 * `npx dsh`), so `npx -y typescript-language-server --stdio` resolves directly;
 * other servers are launched by their bare command names.
 */
export declare function defaultLspSpawn(def: LspServerDef, cwd: string, spawnFn?: LspSpawnFn): ChildProcess;
export declare function createMultiLspManager(cwd: string, opts?: MultiLspOptions): LspManager;
export {};
