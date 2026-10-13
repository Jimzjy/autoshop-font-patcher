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
    if (req.method === "POST" && url.pathname === "/api/apply") {
      const opts = await readBody(req);
      try {
        assertNotRunning({ kill: Boolean(opts.kill) });
        const r = applyPatch(opts.font);
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
listen(Number(process.env.PORT) || 8791);
