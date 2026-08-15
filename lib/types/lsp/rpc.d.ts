import { type Readable, type Writable } from 'node:stream';
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params: Record<string, unknown>;
}
interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}
interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}
type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
export interface RpcClient {
    request(method: string, params: Record<string, unknown>): Promise<unknown>;
    notify(method: string, params?: Record<string, unknown>): void;
    onNotification(method: string, handler: (params: Record<string, unknown>) => void): void;
    dispose(): void;
}
export declare function encodeMessage(msg: JsonRpcMessage): string;
export declare function decodeMessages(input: string | Buffer): {
    messages: JsonRpcMessage[];
    rest: string;
};
export declare function createRpcClient(readable: Readable, writable: Writable): RpcClient;
export {};
