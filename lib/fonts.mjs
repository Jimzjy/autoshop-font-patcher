/**
 * 枚举系统已安装的字体。
 *
 * 从注册表读取，只列真实存在的字体名。这一点很重要：字体名拼写错误时
 * Windows 不会报错，而是静默回退到默认字体，表现为"改了没反应"。
 * 让用户只从已安装列表中挑选可以避免这种情况。
 */
import { execFileSync } from "node:child_process";

let cache = null;

const PS_SCRIPT = `
$keys = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
)
$families = New-Object System.Collections.Generic.HashSet[string]
foreach ($k in $keys) {
  if (-not (Test-Path $k)) { continue }
  (Get-Item $k).Property | ForEach-Object {
    $n = $_ -replace '\\s*\\((TrueType|OpenType|Type 1|Raster|Vector)\\)\\s*$',''
    $n = $n -replace '\\s*&\\s*.*$',''
    $n = $n -replace '\\s+(Bold Italic|Bold Oblique|Bold|Italic|Oblique|Light Italic|Light|Black Italic|Black|Semibold Italic|Semibold|SemiBold|Semilight|ExtraBold|ExtraLight|Thin|Medium|Regular|Normal|Condensed|Narrow|Book)$',''
    $n = $n.Trim()
    if ($n.Length -ge 1 -and $n.Length -le 59) { [void]$families.Add($n) }
  }
}
$families | Sort-Object
`;

/** @returns {string[]} 已安装的字体族名，已排序 */
export function installedFonts({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  if (process.platform !== "win32") return (cache = []);
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], {
      encoding: "utf8", timeout: 30000, windowsHide: true,
    });
    cache = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    cache = [];
  }
  return cache;
}

/** 等宽字体优先排序，方便挑选。 */
export function sortForDisplay(fonts) {
  const prefer = [
    "Consolas", "Cascadia Mono", "Cascadia Code", "JetBrains Mono",
    "Lucida Console", "Lucida Sans Unicode", "Courier New", "Microsoft YaHei",
  ];
  const head = prefer.filter((n) => fonts.includes(n));
  const rest = fonts.filter((n) => !head.includes(n));
  return head.concat(rest);
}
