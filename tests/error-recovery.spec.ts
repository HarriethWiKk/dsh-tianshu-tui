/**
 * agent 错误恢复指引（format/error-recovery.ts）— 模式识别表与警告组装契约。
 *
 * - errorRecoveryHint：鉴权/超长/超时三族 + 兜底，顺序即优先级。
 * - formatWarnWithHint：警告 warning 色单行；hint 给 dim 色 `  ↳ ` 尾随行。
 */

import { describe, expect, it } from 'vitest'
import { errorRecoveryHint, formatWarnWithHint } from '../src/format/error-recovery.js'

describe('errorRecoveryHint（错误 → 恢复指引模式识别表）', () => {
  it('401/unauthorized/鉴权 → /key 重新配置', () => {
    expect(errorRecoveryHint('Error: 401 Unauthorized')).toBe('/key 重新配置')
    expect(errorRecoveryHint('鉴权失败：token 无效')).toBe('/key 重新配置')
  })

  it('context overflow/too long/长度 → /compact 压缩上下文', () => {
    expect(errorRecoveryHint('context overflow: prompt exceeds window')).toBe('/compact 压缩上下文')
    expect(errorRecoveryHint('prompt is too long')).toBe('/compact 压缩上下文')
    expect(errorRecoveryHint('上下文长度超限')).toBe('/compact 压缩上下文')
  })

  it('timeout/网络/ECONN → ↑ 收回重发', () => {
    expect(errorRecoveryHint('request timeout after 30s')).toBe('↑ 收回重发')
    expect(errorRecoveryHint('connect ECONNREFUSED 127.0.0.1:443')).toBe('↑ 收回重发')
    expect(errorRecoveryHint('网络不可达')).toBe('↑ 收回重发')
  })

  it('兜底 → Esc 打断 · ↑ 重发 · /session 换会话', () => {
    expect(errorRecoveryHint('some random failure')).toBe('Esc 打断 · ↑ 重发 · /session 换会话')
  })

  it('大小写不敏感；识别顺序即优先级（401 先于超时族命中）', () => {
    expect(errorRecoveryHint('Request Timeout: HTTP 401')).toBe('/key 重新配置')
  })
})

describe('formatWarnWithHint（警告 + 恢复指引尾随行组装）', () => {
  const theme = { warning: '#ff0000', dim: '#888888' }
  const strip = (s: string): string => s.replace(/\x1B\[[0-9;]*m/g, '')

  it('无 hint：单行警告（warning 色），无尾随行', () => {
    const out = formatWarnWithHint('⚠ 出错了', undefined, theme)
    expect(out).not.toContain('\n')
    expect(strip(out)).toBe('⚠ 出错了')
  })

  it('有 hint：尾随行 dim 色 `  ↳ <hint>`（两空格缩进对齐多行指引风格）', () => {
    const out = formatWarnWithHint('⚠ 出错了', '/key 重新配置', theme)
    expect(out.split('\n').map(strip)).toEqual(['⚠ 出错了', '  ↳ /key 重新配置'])
    // 尾随行走 dim（#888888 → 38;2;136;136;136），警告行走 warning（#ff0000）
    expect(out).toContain('\x1B[38;2;255;0;0m')
    expect(out).toContain('\x1B[38;2;136;136;136m  ↳ /key 重新配置')
  })
})
