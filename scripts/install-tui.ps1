# dsh-tui 一键安装 + 启动（Windows PowerShell 5.1+ / PowerShell 7）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\install-tui.ps1            # 安装 + 启动
#   powershell -ExecutionPolicy Bypass -File scripts\install-tui.ps1 -NoLaunch  # 只安装装配
#
# 说明：
#   - 官方 CLI（@deepseek-ai/dsh）依赖树大，npm 11（node 24 自带）安装时会
#     JavaScript heap OOM——本脚本一律走 pnpm（corepack 自带或 npx 兜底）。
#   - 默认用 npmmirror 镜像加速（国内网络）；设 NPM_CONFIG_REGISTRY 可覆盖。
#   - 每次调用经 pnpm dlx 拉取官方 CLI（缓存命中后秒级），不依赖全局 PATH。
param([switch]$NoLaunch)

$ErrorActionPreference = "Stop"
$Registry = if ($env:NPM_CONFIG_REGISTRY) { $env:NPM_CONFIG_REGISTRY } else { "https://registry.npmmirror.com" }

function Say([string]$Text) { Write-Host "== $Text ==" -ForegroundColor Cyan }
function Die([string]$Text) { Write-Host "x $Text" -ForegroundColor Red; exit 1 }

# 1. node（^22.19 || >=24）
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die "缺少 Node.js（^22.19 || >=24）。请先安装：https://nodejs.org/"
}
$NodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($NodeMajor -lt 22) {
  Die "Node.js 版本过低（$(node -v)，需要 ^22.19 || >=24）。请升级后重跑。"
}

# 2. pnpm（没有则 corepack 启用；corepack 的 shim 需新 shell，用 npx 兜底）
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Say "未检测到 pnpm，用 corepack 启用（Node 自带）"
  try { corepack enable } catch { }
}
$env:NPM_CONFIG_REGISTRY = $Registry
# pnpm 经 npm_config_registry（小写）读 registry——两个都设（pnpm dlx 不认 --registry 参数）
$env:npm_config_registry = $Registry
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Say "pnpm 不可直接调用——用 npx -y pnpm 兜底（首次会下载 pnpm）"
}

function Invoke-Dsh([string[]]$Args) {
  if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    & pnpm dlx @deepseek-ai/dsh @Args
  } else {
    & npx -y pnpm dlx @deepseek-ai/dsh @Args
  }
  if ($LASTEXITCODE -ne 0) { Die "官方 CLI 调用失败（exit $LASTEXITCODE）。网络问题可换镜像：`$env:NPM_CONFIG_REGISTRY='https://registry.npmjs.org' 后重跑" }
}

# 3. 官方 CLI 可用性确认
Say "安装官方 dsh CLI（pnpm，registry=$Registry）"
Invoke-Dsh @("--version") | Out-Null

# 4. 装配 tui 插件（幂等：重复执行会覆盖更新到最新）
Say "装配 tui 插件（@huiliyi37/dsh-tianshu-tui）"
Invoke-Dsh @("plugin", "--profile", "tui", "add", "@huiliyi37/dsh-tianshu-tui")

# 5. 启动
if ($NoLaunch) {
  Write-Host ""
  Write-Host "安装完成。启动："
  Write-Host "  pnpm dlx --registry $Registry @deepseek-ai/dsh --profile tui"
  Write-Host "（或 pnpm 全局安装后直接：dsh --profile tui）"
  exit 0
}
Say "启动 dsh TUI（--profile tui）"
Invoke-Dsh @("--profile", "tui")
