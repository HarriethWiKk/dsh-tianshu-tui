/**
 * provider/model 路由键解析（模型选择器行 value 与 /model 实参的同一文法）。
 *
 * 只按**首个**斜杠分割：模型 id 自身可含 `/`（OpenRouter 风格 id 如
 * `stealth/ox-alpha`），而 provider 路由键不含。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/engine/route-key
 */

/**
 * 解析 `provider/model` 组合路由键。
 * @param value - 组合键字符串。
 * @returns 解析结果；任一侧为空（无斜杠、斜杠在首尾）时为 undefined。
 */
export function parseRouteKey(value: string): { provider: string; model: string } | undefined {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash >= value.length - 1) return undefined
  return { provider: value.slice(0, slash), model: value.slice(slash + 1) }
}
