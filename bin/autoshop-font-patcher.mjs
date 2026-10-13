#!/usr/bin/env node
/**
 * autoshop-font-patcher —— 命令行版
 *
 * 用法：
 *   node bin/autoshop-font-patcher.mjs status                        查看状态与逐点字节预检
 *   node bin/autoshop-font-patcher.mjs list                          列出内置字体与落点容量
 *   node bin/autoshop-font-patcher.mjs install                       应用默认字体 Consolas
 *   node bin/autoshop-font-patcher.mjs install --font "Cascadia Mono"  换成指定字体
 *   node bin/autoshop-font-patcher.mjs revert                        从备份完整还原
 *
 * 需要先关闭 AutoShop。
 */
import fs from "node:fs";
import { fonts, BUILTIN_FONTS, SLOT, getStatus, applyPatch, revertPatch } from "../lib/patch.mjs";
import { assertNotRunning } from "../lib/process.mjs";

function printStatus() {
  const s = getStatus();
  if (!s.exists) return console.error("找不到 " + s.exe);
  console.log(`文件      : ${s.exe}`);
  console.log(`适配版本  : AutoShop ${s.supportedVersion}`);
  console.log(`大小      : ${s.size}`);
  console.log(`当前哈希  : ${s.hash}`);
  console.log(`备份      : ${s.backupExists ? fonts.backup : "不存在"}`);
  console.log(`补丁状态  : ${s.patched ? "已应用（与记录一致）" : s.isOriginal === true ? "原始版本" : s.isOriginal === false ? "已变化（哈希与记录不符）" : "未知"}`);
  console.log(`记录字体  : ${s.recordedFont ?? "(无)"}`);
  console.log(`落点字体  : "${s.slotName}"`);
  console.log(`落点体检  : ${s.slotCheck.ok ? "通过" : "★ 无效"} (段 ${s.slotCheck.section}, VA 0x${s.slotCheck.va?.toString(16)}${s.slotCheck.reason ? ", " + s.slotCheck.reason : ""})`);
  console.log("\n7 处站点逐字节预检：");
  for (const r of s.sites) {
    console.log(`  ${r.key.padEnd(6)} off=0x${r.off.slice(2).padStart(8, "0")}  ${r.isOriginal ? "原始" : "已改 "}  ->  ${r.ok ? r.target : "★ 非 push 指令"}`);
  }
}

function printList() {
  const s = getStatus();
  console.log("exe 中已有的字体名字符串（无需写入新字节）：");
  for (const f of BUILTIN_FONTS) console.log(`  "${f.name}"  @0x${f.addr.toString(16)}`);
  console.log(`\n可写空闲区：文件偏移 0x${SLOT.off.toString(16)}，容量 ${SLOT.capacity} 字节`);
  console.log(`  即字体名最长 ${SLOT.capacity - 1} 个字符`);
  if (s.exists) console.log(`  当前内容："${s.slotName}"`);
  console.log(`\n落点体检：${s.slotCheck.ok ? "通过" : "★ 无效 —— " + s.slotCheck.reason}`);
  console.log("\n提示：字体名必须与系统内完全一致。拼错时 Windows 会静默回退，界面看起来毫无变化。");
}

function parseFontArg() {
  const args = process.argv.slice(2);
  let name = null;
  for (let i = 0; i < args.length; i++) if (args[i] === "--font" && args[i + 1]) name = args[i + 1];
  return name ?? "Consolas";
}

function doInstall() {
  const font = parseFontArg();
  assertNotRunning();
  const r = applyPatch(font);
  console.log(`\n已应用字体：${r.font}${r.builtin ? "（exe 内置字符串）" : `（写入空闲区 0x${SLOT.off.toString(16)}）`}`);
  console.log(`改动站点  ：${r.changed.length} 处 ${r.changed.join(", ") || "(指针原本就指向它)"}`);
  console.log(`字节总数  ：${r.size}（与原文件一致，未增删）`);
  console.log(`新哈希    ：${r.hash}`);
  console.log("\n启动 AutoShop 打开一个含代码/指令表的程序查看效果。");
}

function doRevert() {
  assertNotRunning();
  const r = revertPatch();
  console.log(`已从备份完整还原：${fonts.EXE}`);
  console.log(`哈希：${r.hash}${r.matchesOriginal ? "  （与原文件逐字节一致）" : ""}`);
}

const cmd = process.argv[2] ?? "status";
try {
  if (cmd === "status") printStatus();
  else if (cmd === "list") printList();
  else if (cmd === "install") doInstall();
  else if (cmd === "revert") doRevert();
  else {
    console.error(`未知命令：${cmd}\n用法：status | list | install [--font "<名称>"] | revert`);
    process.exit(2);
  }
} catch (e) {
  console.error("错误：" + e.message);
  process.exit(1);
}
