# 清理残留服务
# 扫描 8791-8801，识别是否为本工具的残留服务；能停的就停，停不了的说清原因。
$ErrorActionPreference = 'SilentlyContinue'

$found = $false

Write-Host ''
Write-Host '  检查端口 8791-8801 上是否有本工具的残留服务...'
Write-Host ''

foreach ($port in 8791..8801) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { continue }

    $ownerPid = ($conn.OwningProcess | Select-Object -First 1)
    $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    if (-not $proc) { continue }

    # 只有响应里带界面标题的，才确认是本工具的残留
    $isOurs = $false
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 3
        if ($r.Content -like '*AutoShop 字体切换*') { $isOurs = $true }
    } catch { }

    if (-not $isOurs) {
        Write-Host ("  端口 {0} 被 PID {1}（{2}）占用，但不是本工具，跳过。" -f $port, $ownerPid, $proc.ProcessName)
        continue
    }

    $found = $true
    Write-Host ("  端口 {0} 有本工具的残留服务：PID {1}（{2}）" -f $port, $ownerPid, $proc.ProcessName)

    if ($proc.ProcessName -eq 'node') {
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        if (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue) {
            Write-Host '    -> 结束失败，可能权限不足，请手动结束。'
        } else {
            Write-Host '    -> 已结束。'
        }
    } else {
        Write-Host ("    -> 它不是 node 进程，而是 {0}。" -f $proc.ProcessName)
        Write-Host '       这通常意味着服务是被别的程序（如编辑器）托管启动的。'
        Write-Host '       请在对应程序里停止运行/调试会话，或在任务管理器里结束它。'
    }
}

if (-not $found) { Write-Host '  没有发现本工具的残留服务。' }

Write-Host ''
Write-Host '  完成。现在可以运行 启动工具.cmd。'
Write-Host ''
