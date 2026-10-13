/**
 * AutoShop 运行检测与结束。
 *
 * ## 为什么不能只看进程路径
 * AutoShop 常以管理员权限启动。此时普通权限的 `Get-Process` 读不到它的
 * `Path` 属性，若仅以路径匹配判定运行状态，就会漏判并在软件运行中改写 exe。
 * 因此读不到路径时按"运行中"处理（fail-closed）。
 */
import { execFileSync } from "node:child_process";

const EXE = "C:\\Inovance Control\\AutoShop\\AutoShop.exe";

let cache = null;

const PS_LIST = `
$target = [System.IO.Path]::GetFullPath('__EXE__')
$out = @()
foreach ($p in (Get-Process -Name AutoShop -ErrorAction SilentlyContinue)) {
  $path = $null
  try { $path = $p.Path } catch { $path = $null }
  if (-not $path) {
    try { $path = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.Id) -ErrorAction SilentlyContinue).ExecutablePath } catch { $path = $null }
  }
  $verdict = 'unknown'
  if ($path) {
    if ($path -ieq $target) { $verdict = 'match' } else { $verdict = 'other' }
  } else {
    # 路径读不到（常见于管理员权限运行）。Get-Process 按名过滤已保证基名是 AutoShop，
    # 但为免误伤 AutoShopFoo.exe 之类，再取基名做精确比对。
    $base = $null
    try { $base = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.Id) -ErrorAction SilentlyContinue).Name } catch { $base = $null }
    if ($base -and $base -ine 'AutoShop.exe') { $verdict = 'other' } else { $verdict = 'unknown' }
  }
  $out += [pscustomobject]@{ pid = $p.Id; path = $path; verdict = $verdict }
}
if ($out.Count -gt 0) { $out | ConvertTo-Json -Compress } else { '[]' }
`;

const PS_KILL = `
$target = [System.IO.Path]::GetFullPath('__EXE__')
$n = 0
foreach ($p in (Get-Process -Name AutoShop -ErrorAction SilentlyContinue)) {
  $path = $null
  try { $path = $p.Path } catch { $path = $null }
  if (-not $path) {
    try { $path = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.Id) -ErrorAction SilentlyContinue).ExecutablePath } catch { $path = $null }
  }
  if (-not $path -or $path -ieq $target) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    $n++
  }
}
$n
`;

function runPs(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", timeout: 30000, windowsHide: true,
  }).trim();
}

/**
 * @param {{fresh?: boolean}} opts fresh=true 时跳过缓存（改文件前必须用）
 * @returns {{supported: boolean, processes: Array, unreadablePath?: number, sameNameOtherPath?: number, error?: string}}
 */
export function runningAutoShop({ fresh = false } = {}) {
  if (process.platform !== "win32") return { supported: false, processes: [], error: "非 Windows 平台" };

  // 界面会定期轮询，而每次检测都要起一个 PowerShell 进程：缓存 2 秒摊薄开销。
  const now = Date.now();
  if (!fresh && cache && now - cache.at < 2000) return cache.value;

  let raw;
  try {
    raw = runPs(PS_LIST.replace("__EXE__", EXE.replace(/'/g, "''")));
  } catch (e) {
    const value = { supported: false, processes: [], error: String(e.message ?? e) };
    cache = { at: now, value };
    return value;
  }

  let arr;
  try {
    const j = JSON.parse(raw || "[]");
    arr = Array.isArray(j) ? j : [j];
  } catch {
    const value = { supported: false, processes: [], error: "解析进程列表失败" };
    cache = { at: now, value };
    return value;
  }

  const matched = arr.filter((p) => p.verdict === "match" || p.verdict === "unknown");
  const value = {
    supported: true,
    processes: matched,
    sameNameOtherPath: arr.filter((p) => p.verdict === "other").length,
    unreadablePath: matched.filter((p) => p.verdict === "unknown").length,
  };
  cache = { at: now, value };
  return value;
}

/**
 * 改文件前的统一闸门。读不到路径时按"运行中"处理。
 * @param {{kill?: boolean}} opts
 */
export function assertNotRunning({ kill = false } = {}) {
  let run = runningAutoShop({ fresh: true });
  const looksRunning = !run.supported || run.processes.length > 0;
  if (!looksRunning) return { killed: 0 };

  if (!kill) {
    let why;
    if (!run.supported) why = `无法确认 AutoShop 是否在运行（${run.error || "检测失败"}）`;
    else if (run.unreadablePath > 0) why = `检测到 ${run.processes.length} 个 AutoShop 进程，但有 ${run.unreadablePath} 个无法读取路径（通常因为软件以管理员权限运行）`;
    else why = `AutoShop 正在运行（PID ${run.processes.map((p) => p.pid).join(", ")}）`;
    throw new Error(`${why}，已拒绝修改。请先关闭 AutoShop。`);
  }

  const unreadable = run.processes.find((p) => p.verdict === "unknown");
  if (unreadable) {
    throw new Error(
      `无法结束 AutoShop（PID ${unreadable.pid}）：它以便管理员权限运行，普通权限无权结束。\n` +
      "请手动关闭 AutoShop，或以管理员权限重新启动本工具。"
    );
  }
  const killed = Number(runPs(PS_KILL.replace("__EXE__", EXE.replace(/'/g, "''")))) || 0;
  const after = runningAutoShop({ fresh: true });
  if (after.processes.length > 0) {
    throw new Error(`结束进程后仍有 ${after.processes.length} 个 AutoShop 在运行（PID ${after.processes.map((p) => p.pid).join(", ")}），请手动确认。`);
  }
  return { killed };
}
