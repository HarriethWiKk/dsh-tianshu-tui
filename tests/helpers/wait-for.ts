/**
 * tests/helpers/wait-for — flaky 测试加固辅助。
 *
 * 背景：全量 vitest（forks 并行 + CPU 竞争）下，真实时钟固定等待
 * （setTimeout(120) 等）与「attach 后立即断言」会时序抖动——单跑全绿、
 * 全量偶红。轮询等待把「等固定时长」改为「等到目标出现（带超时）」，
 * 时序鲁棒且断言强度不减（超时即失败，附探针摘要可定位）。
 *
 * 仅依赖 node 内置 + vitest；不引入 fake timers。
 */

export interface WaitForOptions {
  /** 总超时（毫秒）。缺省 3000。 */
  timeoutMs?: number
  /** 轮询间隔（毫秒）。缺省 25。 */
  intervalMs?: number
  /** 失败消息中的条件描述。 */
  describe?: string
}

/**
 * 轮询等待：反复执行 probe() 直到返回 true 或超时。
 * 超时抛错并附最后探针摘要；不吞错（probe 抛错直接上抛，属测试缺陷）。
 */
export async function waitFor(
  probe: () => boolean | Promise<boolean>,
  opts: WaitForOptions = {},
): Promise<void> {
  const { timeoutMs = 3000, intervalMs = 25, describe = 'condition' } = opts
  const deadline = Date.now() + timeoutMs
  let last: boolean | Promise<boolean> = false
  for (;;) {
    last = probe()
    if ((await last) === true) return
    if (Date.now() >= deadline) {
      throw new Error(`waitFor 超时（${timeoutMs}ms）：${describe} 未满足（最后探针=${String(last)}）`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/** stdout.write 替身的最小结构（vi.fn 包装）。 */
export interface StdoutWriteMock {
  write: { mock: { calls: unknown[][] } }
}

/** 轮询拼接 stdout.write 全部调用，直到包含 needle（渲染帧稳定）。 */
export async function waitForStdout(
  stdout: StdoutWriteMock,
  needle: string,
  opts: WaitForOptions = {},
): Promise<void> {
  const written = (): string => stdout.write.mock.calls.map((c) => `${c[0]}`).join('')
  await waitFor(() => written().includes(needle), {
    ...opts,
    describe: opts.describe ?? `stdout 包含 ${JSON.stringify(needle)}`,
  })
  if (!written().includes(needle)) {
    throw new Error(`waitForStdout 断言失败：${JSON.stringify(needle)} 未出现在 stdout 写入中`)
  }
}
