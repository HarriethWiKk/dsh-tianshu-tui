/**
 * agent-scope-service — isolate 服务优先从当前 agent 的预设面读。
 *
 * 官方 standard 把 compact / planMode / workflowEngine 放进 isolate realm，
 * host reflect.get 为 undefined。有花名册时走 serviceFor(agent, name)。
 *
 * @module @huiliyi37/dsh-tianshu-tui/adapter/agent-scope-service
 */
export interface AgentScopeHost {
    reflect?: {
        get(name: string, required?: boolean): unknown;
    };
}
export interface AgentScopeHandle {
    ctx?: unknown;
}
/** 读名为 name 的服务：agent isolate → host reflect。 */
export declare function serviceForAgent(host: AgentScopeHost, agent: AgentScopeHandle | null | undefined, name: string): unknown;
/** 按当前会话 id 取 agent，再读 isolate/host 服务。 */
export declare function scopedService(host: AgentScopeHost & {
    agents?: {
        get(id: string): AgentScopeHandle | undefined;
    };
}, sessionId: string | null, name: string): unknown;
