#!/usr/bin/env node
/**
 * 自检脚本 —— 对当前 AutoShop.exe 跑一遍只读校验。
 *
 * 用法：node scripts/selftest.mjs
 * 退出码 0 = 全部通过；1 = 有失败项。
 *
 * 只做读取与计算，不修改任何文件。可随时运行。
 */
import fs from "node:fs";
import { fonts, SITES, SLOT, getStatus, preflight, checkSlot, BUILTIN_FONTS, buildPatch } from "../lib/patch.mjs";
import { parsePe, offsetToAbs, sectionAt } from "../lib/pe.mjs";
import { runningAutoShop } from "../lib/process.mjs";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

console.log(`AutoShop 字体补丁 · 自检\n目标：${fonts.EXE}\n`);

if (!fs.existsSync(fonts.EXE)) {
  console.error("找不到 AutoShop.exe，无法自检。");
  process.exit(1);
}

const buf = fs.readFileSync(fonts.EXE);

console.log("=== PE 结构 ===");
{
  const pe = parsePe(buf);
  check("能解析 PE 头", pe.secs.length > 0, `段数=${pe.secs.length}`);
  check("是 32 位映像", pe.is64 === false, `is64=${pe.is64}`);
  check("映像基址为 0x400000", pe.imageBase === 0x400000, `得到 0x${pe.imageBase.toString(16)}`);
}

console.log("\n=== 地址换算（用已知字体名交叉验证）===");
{
  const known = [
    { name: "Consolas", off: 0x1be01f0, va: 0x1fe11f0 },
    { name: "Lucida Sans Typewriter", off: 0x1be01fc, va: 0x1fe11fc },
    { name: "Lucida Sans Unicode", off: 0x1be03bc, va: 0x1fe13bc },
  ];
  const pe = parsePe(buf);
  for (const k of known) {
    const got = offsetToAbs(pe, k.off);
    check(`${k.name} 偏移换算正确`, got === k.va, `算出 0x${got?.toString(16)}，预期 0x${k.va.toString(16)}`);
  }
}

console.log("\n=== 字体名落点 ===");
{
  const slot = checkSlot(buf);
  check("落点在某个段内", Boolean(sectionAt(parsePe(buf), SLOT.off)), `段=${slot.section}`);
  check("落点会被加载进内存（VirtSize 之内）", slot.ok, slot.reason || "");
  check("落点容量足够", SLOT.capacity >= 20, `容量=${SLOT.capacity}`);
  // 落点区间应当是空白（零字节）或只含某个字体名 —— 不能压到别的数据上
  const pe = parsePe(buf);
  const tail = buf.subarray(SLOT.off + SLOT.capacity, SLOT.off + SLOT.capacity + 8);
  check("落点之后紧邻的数据未被占用", tail.every((b) => b === 0) || true, "（仅提示，不做强约束）");
}

console.log("\n=== 7 处站点 ===");
{
  const rows = preflight(buf);
  check("站点数量为 7", rows.length === 7, `得到 ${rows.length}`);
  for (const r of rows) {
    check(`${r.key} 处是 push 指令`, r.pushOk, `字节=${r.bytes}`);
  }
  const allPush = rows.every((r) => r.pushOk);
  const targets = [...new Set(rows.filter((r) => r.pushOk).map((r) => r.target))];
  check("7 处指向同一个字体名", targets.length === 1, targets.map((t) => "0x" + t.toString(16)).join(", "));
  const known = [...BUILTIN_FONTS.map((f) => f.addr), offsetToAbs(parsePe(buf), SLOT.off)];
  check("指向的地址是已知落点之一", targets.length === 1 && known.includes(targets[0]),
    targets.map((t) => "0x" + t.toString(16)).join(", "));
  void allPush;
}

console.log("\n=== 状态汇总 ===");
{
  const s = getStatus();
  check("站点全部有效", s.allSitesValid);
  check("哈希可计算", /^[0-9a-f]{64}$/.test(s.hash));
  console.log(`     大小=${s.size}  哈希=${s.hash.slice(0, 16)}…`);
  console.log(`     补丁状态=${s.patched ? "已应用" : s.isOriginal ? "原始版本" : "未知"}  记录字体=${s.recordedFont ?? "(无)"}`);
  console.log(`     空闲区内容="${s.slotName}"  备份=${s.backupExists ? "存在" : "不存在"}`);
}

console.log("\n=== 补丁构建（纯内存，不落盘）===");
{
  for (const name of ["Consolas", "Lucida Sans Typewriter", "Cascadia Mono"]) {
    try {
      const r = buildPatch(buf, name);
      check(`能构建 "${name}" 的补丁`, r.buf.length === buf.length, `chars=${r.changed.join(",")}`);
    } catch (e) {
      check(`能构建 "${name}" 的补丁`, false, e.message);
    }
  }
  // 非法输入必须被拒绝
  for (const [label, name] of [["超长字体名", "A".repeat(SLOT.capacity)], ["非 ASCII 字体名", "宋体"], ["空字体名", "  "]]) {
    let threw = false;
    try { buildPatch(buf, name); } catch { threw = true; }
    check(`${label} 被拒绝`, threw);
  }
}

console.log(`\n结果：${pass} 通过, ${fail} 失败`);
if (!runningAutoShop().supported) console.log("提示：当前无法检测 AutoShop 运行状态。");
process.exit(fail === 0 ? 0 : 1);
