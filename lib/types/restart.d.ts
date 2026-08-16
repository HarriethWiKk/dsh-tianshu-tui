/**
 * 进程重启原语：以与当前进程相同的命令行（process.argv）重新启动，
 * 继承同一终端（stdio inherit）。供 /restart 命令与启动自更新后的
 * 自动重启使用——TUI 是 dsh 宿主的插件，重启宿主进程 = 重放宿主 argv。
 *
 * POSIX 上 detached（子进程成为新会话 leader）：父进程退出时子进程
 * 不会收到终端的 SIGHUP，也因脱离控制终端而不触发后台读 TTY 的
 * SIGTTIN；继承的 TTY fd 仍可正常读写（raw mode 是终端设备属性）。
 * Windows 上不用 detached（会另开控制台窗口），stdio 继承 +
 * windowsHide 让子进程继续占用同一控制台。
 *
 * @module @huiliyi37/dsh-tianshu-tui/restart
 */
export interface SpawnSelfRestartOptions {
    /** 重启命令行；缺省 process.argv（argv[0]=node 可执行，argv[1..]=脚本+参数）。 */
    argv?: string[];
}
/**
 * 尝试以相同命令重启当前进程。
 *
 * resolve true = 新进程已成功启动（'spawn' 事件，exec 完成）——调用方
 * 应随后退出当前进程，让新进程接管终端；resolve false = 无法启动
 * （argv 无效 / spawn error 如 ENOENT）。不等待新进程退出——成功后
 * unref，父进程随时可 exit。
 */
export declare function spawnSelfRestart(options?: SpawnSelfRestartOptions): Promise<boolean>;
