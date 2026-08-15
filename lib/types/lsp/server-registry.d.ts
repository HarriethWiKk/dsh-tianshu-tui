/**
 * LSP server registry — maps file extensions to language servers and detects
 * which are installed, so the agent gets go-to-definition / diagnostics for
 * many languages instead of TypeScript only.
 *
 * Pure + injectable (`which` is passed in) so selection logic is unit-testable
 * without the servers actually being installed.
 */
export interface LspServerDef {
    id: string;
    extensions: string[];
    command: string;
    args: string[];
    /** LSP languageId base (refined per-extension by the manager). */
    languageId: string;
    /** Binary that must exist on PATH (defaults to `command`). */
    binary?: string;
    /** True when the launcher (e.g. npx) is assumed present without a PATH probe. */
    alwaysAvailable?: boolean;
}
/**
 * Known servers, ordered by extension specificity. TypeScript is launched via
 * `npx -y` (matching the prior behavior) so it is always considered available.
 */
export declare const LSP_SERVERS: readonly LspServerDef[];
export type WhichFn = (bin: string) => boolean;
export declare function defaultWhich(bin: string): boolean;
/** The server def that handles a given extension, or null. */
export declare function serverDefForExt(ext: string): LspServerDef | null;
export declare function isServerAvailable(def: LspServerDef, which?: WhichFn): boolean;
/** The available server for a file, or null when unsupported / not installed. */
export declare function serverForFile(filePath: string, which?: WhichFn): LspServerDef | null;
/** All servers installed on this machine (for diagnostics / readiness checks). */
export declare function availableServers(which?: WhichFn): LspServerDef[];
