#!/usr/bin/env node
/**
 * autoshop-font-patcher —— 图形界面版
 *
 * 本地小服务 + 浏览器界面：查看状态 / 从已装字体里挑一个应用 / 一键还原。
 * 只监听 127.0.0.1；端口被占用时自动顺延。
 *
 * 用法：
 *   node bin/autoshop-font-ui.mjs            启动（默认 8791）
 *   node bin/autoshop-font-ui.mjs --open     启动并自动打开浏览器
 *   PORT=9000 node bin/autoshop-font-ui.mjs  指定起始端口
 *
 * 功能与命令行版等价，只是操作更方便。
 */
import http from "node:http";
import { execFileSync } from "node:child_process";
import { getStatus, applyPatch, revertPatch, fonts } from "../lib/patch.mjs";
import { THEMES, THEME_ROLES } from "../lib/theme.mjs";
import { runningAutoShop, assertNotRunning } from "../lib/process.mjs";
import { installedFonts, sortForDisplay } from "../lib/fonts.mjs";
import { PAGE } from "../web/page.mjs";

const STARTED_AT = new Date().toISOString();
let activePort = null;

/** 自报身份，便于排查"端口被谁占了"。 */
function whoAmI(port) {
  const info = { pid: process.pid, port, nodeVersion: process.version, script: process.argv[1], startedAt: STARTED_AT };
  if (process.platform !== "win32") return info;
  try {
    const script = `
$cur = Get-CimInstance Win32_Process -Filter ("ProcessId=" + ${process.pid}) -ErrorAction SilentlyContinue
$chain = @()
for ($i = 0; $i -lt 4 -and $cur; $i++) {
  $chain += [pscustomobject]@{ pid = $cur.ProcessId; name = $cur.Name; parent = $cur.ParentProcessId }
  $cur = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $cur.ParentProcessId) -ErrorAction SilentlyContinue
}
$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$owner = $null
if ($c) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  $owner = [pscustomobject]@{ pid = $c.OwningProcess; name = $(if ($p) { $p.ProcessName } else { $null }) }
}
[pscustomobject]@{ chain = $chain; owner = $owner } | ConvertTo-Json -Compress -Depth 5
`;
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20000, windowsHide: true }).trim();
    const parsed = JSON.parse(out || "{}");
    info.processChain = parsed.chain ?? [];
    info.portOwner = parsed.owner ?? null;
    if (info.portOwner && info.portOwner.pid !== process.pid) {
      info.note = "持有该端口的进程与本服务不是同一个，说明还有另一个实例在运行。";
    }
  } catch (e) {
    info.error = String(e.message ?? e);
  }
  return info;
}

const send = (res, code, obj) => {
  const isHtml = typeof obj === "string" && obj.startsWith("<!DOCTYPE");
  res.writeHead(code, {
    "content-type": isHtml ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
};

const readBody = (req) => new Promise((resolve) => {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, PAGE);
    if (req.method === "GET" && url.pathname === "/api/whoami") return send(res, 200, whoAmI(activePort));
    if (req.method === "GET" && url.pathname === "/api/state") {
      return send(res, 200, { ...getStatus(), running: runningAutoShop(), exePath: fonts.EXE });
    }
    if (req.method === "GET" && url.pathname === "/api/fonts") {
      return send(res, 200, { fonts: sortForDisplay(installedFonts()) });
    }
    if (req.method === "GET" && url.pathname === "/api/themes") {
      // 返回完整色表，供 UI 做色块预览与逐角色编辑
      const themes = [
        { key: "original", label: THEMES.original.label, colors: null },
        ...Object.values(THEMES).filter((t) => t.key !== "original").map((t) => ({ key: t.key, label: t.label, colors: t.colors })),
      ];
      return send(res, 200, { themes, roles: THEME_ROLES });
    }
    if (req.method === "POST" && url.pathname === "/api/apply") {
      const opts = await readBody(req);
      // font / theme 各自独立：请求里带哪个字段就只改哪个维度，未带的保持现状。
      const hasFont = typeof opts.font === "string" && opts.font.trim() !== "";
      const hasTheme = typeof opts.theme === "string" && opts.theme.trim() !== "" && opts.theme !== "none";
      if (!hasFont && !hasTheme) {
        return send(res, 400, { ok: false, error: "请求里没有 font 或 theme，无需改动" });
      }
      try {
        assertNotRunning({ kill: Boolean(opts.kill) });
        const r = applyPatch({
          font: hasFont ? opts.font : null,
          theme: hasTheme ? opts.theme : null,
          colors: hasTheme && opts.theme === "custom" ? opts.colors : null,
        });
        return send(res, 200, { ok: true, ...r, state: { ...getStatus(), running: runningAutoShop({ fresh: true }) } });
      } catch (e) {
        return send(res, 400, { ok: false, error: String(e.message ?? e), state: { ...getStatus(), running: runningAutoShop({ fresh: true }) } });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/revert") {
      const opts = await readBody(req);
      try {
        if (opts.kill) assertNotRunning({ kill: true });
        else assertNotRunning();
        const r = revertPatch();
        return send(res, 200, { ok: true, ...r, state: { ...getStatus(), running: runningAutoShop({ fresh: true }) } });
      } catch (e) {
        return send(res, 400, { ok: false, error: String(e.message ?? e), state: { ...getStatus(), running: runningAutoShop({ fresh: true }) } });
      }
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e.message ?? e) });
  }
});

/** 端口被占用时自动顺延，避免因冲突起不来。 */
function listen(port, triesLeft = 10) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && triesLeft > 0) {
      console.log(`端口 ${port} 被占用，改用 ${port + 1} …`);
      listen(port + 1, triesLeft - 1);
    } else {
      console.error("启动失败：" + err.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    activePort = port;
    const url = `http://127.0.0.1:${port}`;
    console.log("AutoShop 字体切换工具已启动");
    console.log("界面地址：" + url);
    console.log("本服务进程 PID：" + process.pid);
    console.log("（只监听本机 127.0.0.1；关闭本窗口即停止）");
    if (process.argv.includes("--open")) {
      try { execFileSync("cmd", ["/c", "start", "", url], { windowsHide: true }); } catch {}
    }
  });
}
/** 用系统默认浏览器打开 URL，不闪控制台窗口。 */
function openBrowser(url) {
  try { execFileSync("rundll32", ["url.dll,FileProtocolHandler", url], { windowsHide: true }); } catch {}
}

/** 探测是否已有工具实例在 8791–8800 上运行；是则返回其地址。 */
async function findRunningInstance() {
  for (let port = 8791; port <= 8800; port++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/whoami`, { signal: AbortSignal.timeout(400) });
      if (r.ok) return `http://127.0.0.1:${port}`;
    } catch {}
  }
  return null;
}

async function main() {
  if (process.argv.includes("--open")) {
    const existing = await findRunningInstance();
    if (existing) {
      console.log("工具已在运行：" + existing + "，直接打开界面，不重复启动。");
      openBrowser(existing);
      return;
    }
  }
  listen(Number(process.env.PORT) || 8791);
}
main();
