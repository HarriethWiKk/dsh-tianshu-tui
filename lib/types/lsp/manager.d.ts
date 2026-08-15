import type { ChildProcess } from 'node:child_process';
interface Location {
    uri: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
}
/** Simplified LSP Diagnostic for file-level error reporting. */
export interface LspDiagnostic {
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
    severity: 1 | 2 | 3 | 4;
    message: string;
    source?: string;
}
export interface LspManager {
    initialize(): Promise<void>;
    isReady(): boolean;
    supportsDefinition(): boolean;
    supportsReferences(): boolean;
    gotoDefinition(filePath: string, line: number, character: number): Promise<Location[]>;
    findReferences(filePath: string, line: number, character: number): Promise<Location[]>;
    /** Notify the LSP server that a file was modified on disk (e.g. by edit_file/write_file).
     *  Ensures the LSP's internal state stays in sync for subsequent goto-def / find-refs queries. */
    changeFile(filePath: string): void;
    /** T4: file-level diagnostics. Uses pull model (textDocument/diagnostic) if
     *  supported, otherwise falls back to cached publishDiagnostics.
     *  Timeout ~2s; returns empty array on timeout or server unavailability. */
    getFileDiagnostics(filePath: string, timeoutMs?: number): Promise<LspDiagnostic[]>;
    dispose(): void;
}
type SpawnFn = () => ChildProcess;
export declare function createLspManager(spawnFn: SpawnFn, cwd: string): LspManager;
export {};
