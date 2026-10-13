#!/usr/bin/env node
/**
 * 收尾脚本：确认 AutoShop 已关闭后，把字体设成指定值并独立校验结果。
 *
 * 用法：node bin/autoshop-finish.mjs [字体名]     默认 Consolas
 *
 * 用途：给刚用过工具、想确认"到底改成功没有"的人一个可独立核对的入口。
 * 它不依赖界面服务，直接读文件比对。
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { fonts, SITES, SLOT, getStatus, applyPatch } from "../lib/patch.mjs";
import { parsePe, offsetToAbs } from "../lib/pe.mjs";
import { runningAutoShop } from "../lib/process.mjs";

const FONT = process.argv[2] || "Consolas";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const run = runningAutoShop({ fresh: true });
if (!run.supported) {
  console.log("无法确认 AutoShop 是否在运行（" + (run.error || "检测失败") + "），为安全起见中止。");
  console.log("请手动确认软件已关闭后重试。");
  process.exit(1);
}
if (run.processes.length > 0) {
  console.log(`AutoShop 仍在运行（PID ${run.processes.map((p) => p.pid).join(", ")}），无法收尾。`);
  console.log("若是管理员权限启动的，需要手动关闭（提权进程普通权限结束不了）。");
  process.exit(1);
}

console.log("AutoShop 已关闭，开始应用字体…");
const r = applyPatch(FONT);
console.log(`已应用：${r.font}（改动 ${r.changed.length} 处）`);

// 独立校验：重新读文件逐项核对，不依赖上面的返回值
const buf = fs.readFileSync(fonts.EXE);
const pe = parsePe(buf);
const slotAbs = offsetToAbs(pe, SLOT.off);
const targets = [...new Set(SITES.map((s) => "0x" + buf.readUInt32LE(s.off + 1).toString(16)))];
const slotName = (() => { let e = SLOT.off; while (buf[e] !== 0) e++; return buf.subarray(SLOT.off, e).toString("ascii"); })();

console.log("\n=== 校验结果 ===");
console.log(`文件大小     : ${buf.length}`);
console.log(`7 处指向     : ${targets.join(", ")}${targets.length === 1 ? "  （一致 ✓）" : "  ★ 不一致"}`);
console.log(`落点虚拟地址 : 0x${slotAbs?.toString(16)}`);
console.log(`空闲区内容   : "${slotName}"`);
console.log(`落点体检     : ${getStatus().slotCheck.ok ? "通过 ✓" : "★ 无效"}`);
console.log(`备份存在     : ${fs.existsSync(fonts.backup) ? "是 ✓" : "★ 否"}`);
if (fs.existsSync(fonts.backup)) {
  const orig = fs.readFileSync(fonts.backup);
  let diff = 0;
  for (let i = 0; i < Math.min(buf.length, orig.length); i++) if (buf[i] !== orig[i]) diff++;
  console.log(`与原始差异   : ${diff} 字节`);
  console.log(`原始哈希     : ${sha(orig)}`);
}
console.log(`当前哈希     : ${sha(buf)}`);
console.log("\n现在启动 AutoShop，打开一个含代码/指令表的程序确认字体。");
