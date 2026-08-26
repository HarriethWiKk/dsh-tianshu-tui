/**
 * os-notify — 系统通知计划与门闸（固定 argv，失败静默）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  SKIP_NOTIFY_ENV,
  planOsNotify,
  quoteAppleScript,
  quotePowerShell,
  sanitizeNotifyText,
  sendOsNotify,
  shouldNotify,
} from '../src/os-notify.js'

describe('sanitizeNotifyText', () => {
  it('压扁控制字符并截断', () => {
    expect(sanitizeNotifyText('a\n\tb', 80)).toBe('a b')
    expect(sanitizeNotifyText('x'.repeat(12), 8)).toBe('xxxxxxx…')
  })
})

describe('shouldNotify', () => {
  const clean = { PATH: '/usr/bin' }

  it('干净环境放行', () => {
    expect(shouldNotify(clean)).toBe(true)
  })

  it('SKIP / VITEST / CI / SSH 静默', () => {
    expect(shouldNotify({ ...clean, [SKIP_NOTIFY_ENV]: '1' })).toBe(false)
    expect(shouldNotify({ ...clean, VITEST: '1' })).toBe(false)
    expect(shouldNotify({ ...clean, CI: 'true' })).toBe(false)
    expect(shouldNotify({ ...clean, SSH_CONNECTION: '1 2 3 4' })).toBe(false)
    expect(shouldNotify({ ...clean, SSH_CLIENT: '10.0.0.1 1 2' })).toBe(false)
  })
})

describe('planOsNotify', () => {
  it('darwin：osascript -e，正文进 AppleScript 字符串', () => {
    const plan = planOsNotify({ title: 'dsh · 子代理完成', body: '查日志' }, 'darwin')
    expect(plan).toEqual({
      bin: 'osascript',
      args: ['-e', `display notification ${quoteAppleScript('查日志')} with title ${quoteAppleScript('dsh · 子代理完成')}`],
    })
  })

  it('linux：notify-send 标题与正文分参', () => {
    expect(planOsNotify({ title: '任务完成', body: '编译' }, 'linux')).toEqual({
      bin: 'notify-send',
      args: ['任务完成', '编译'],
    })
  })

  it('win32：powershell -NoProfile，单引号转义用户文本', () => {
    const plan = planOsNotify({ title: "it's", body: "a'b" }, 'win32')
    expect(plan?.bin).toBe('powershell')
    expect(plan?.args.slice(0, 3)).toEqual(['-NoProfile', '-WindowStyle', 'Hidden'])
    expect(plan?.args[3]).toBe('-Command')
    expect(plan?.args[4]).toContain(quotePowerShell("it's"))
    expect(plan?.args[4]).toContain(quotePowerShell("a'b"))
  })

  it('引号与控制字符不会拆 argv', () => {
    const plan = planOsNotify({ title: 'say "hi"', body: 'x\ny' }, 'darwin')
    expect(plan?.args).toHaveLength(2)
    expect(plan?.args[1]).toContain(quoteAppleScript('say "hi"'))
    expect(plan?.args[1]).toContain(quoteAppleScript('x y'))
  })

  it('未知平台 → null', () => {
    expect(planOsNotify({ title: 't', body: 'b' }, 'aix')).toBeNull()
  })
})

describe('sendOsNotify', () => {
  it('门闸关闭时不 exec', async () => {
    const execFile = vi.fn()
    expect(await sendOsNotify({ title: 't', body: 'b' }, {
      env: { VITEST: '1' },
      platform: 'linux',
      execFile,
    })).toBe(false)
    expect(execFile).not.toHaveBeenCalled()
  })

  it('linux 计划命中时按固定 argv 调用', async () => {
    const execFile = vi.fn().mockResolvedValue(undefined)
    expect(await sendOsNotify({ title: '任务完成', body: '编译' }, {
      env: { PATH: '/bin' },
      platform: 'linux',
      execFile,
    })).toBe(true)
    expect(execFile).toHaveBeenCalledWith('notify-send', ['任务完成', '编译'])
  })

  it('exec 失败 → false，不抛', async () => {
    const execFile = vi.fn().mockRejectedValue(new Error('ENOENT'))
    await expect(sendOsNotify({ title: 't', body: 'b' }, {
      env: { PATH: '/bin' },
      platform: 'linux',
      execFile,
    })).resolves.toBe(false)
  })
})
