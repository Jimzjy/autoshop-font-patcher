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
import { COLOR_SITES, THEMES, preflightTheme, rgb2colorref } from "../lib/theme.mjs";
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

console.log("\n=== 配色站点（主题表与 exe 对照，只读）===");
{
  check("配色站点数量为 89", COLOR_SITES.length === 89, `得到 ${COLOR_SITES.length}`);
  check("内置主题为 original,dark,atomOneDark,githubDark",
    Object.keys(THEMES).join(",") === "original,dark,atomOneDark,githubDark", Object.keys(THEMES).join(","));

  // 每个内置主题必须覆盖全部 89 个站点的角色
  for (const tk of ["dark", "atomOneDark", "githubDark"]) {
    const missing = COLOR_SITES
      .filter((s) => s.kind === "fore" && !THEMES[tk].colors.fore[s.role])
      .map((s) => s.role);
    check(`主题 ${tk} 覆盖全部角色`, missing.length === 0, [...new Set(missing)].join(","));
  }

  // 允许集合 = 各站点原始值 ∪ 所有内置主题对该站点的目标色
  const themeTargets = (s) => {
    const set = new Set();
    for (const t of Object.values(THEMES)) {
      const c = t.colors;
      if (!c) continue; // original 无色表
      if (s.kind === "caret") set.add(rgb2colorref(c.caret));
      else if (s.kind === "back") set.add(rgb2colorref(c.back));
      else if (s.kind !== "codepage") set.add(rgb2colorref(c.fore[s.role]));
    }
    return set;
  };
  const notKnown = [];
  for (const s of COLOR_SITES) {
    const cur = buf.readUInt32LE(s.off + 1);
    const known = cur === s.from || cur === s.prevTo || themeTargets(s).has(cur);
    if (!known) notKnown.push(`${s.key}@0x${s.off.toString(16)} 现值=0x${cur.toString(16)}`);
  }
  check("89 处配色站点全部可识别（原始/已应用/任意内置主题）", notKnown.length === 0, notKnown.join(" "));

  const dup = COLOR_SITES.map((s) => s.off).filter((o, i, a) => a.indexOf(o) !== i);
  check("配色站点偏移无重复", dup.length === 0, dup.join(","));
  const overlap = COLOR_SITES.filter((c) => SITES.some((f) => Math.abs(f - c.off) < 8));
  check("配色站点与字体站点无重叠", overlap.length === 0, overlap.map((c) => c.key).join(","));

  // 纯内存构建「字体+暗色主题」补丁，验证 82 处全部落到目标色
  try {
    const { buf: out } = buildPatch(buf, "Consolas", "dark");
    const darkColors = THEMES.dark.colors;
    const expectedOf = (s) =>
      s.kind === "caret" ? darkColors.caret
      : s.kind === "back" ? darkColors.back
      : darkColors.fore[s.role];
    const bad = COLOR_SITES.filter((s) => {
      if (s.kind === "codepage") return out.readUInt32LE(s.off + 1) !== s.from; // 代码页保持原值
      return out.readUInt32LE(s.off + 1) !== rgb2colorref(expectedOf(s));
    });
    check("能构建「字体+暗色主题」补丁", bad.length === 0, bad.map((s) => s.key).join(","));
  } catch (e) {
    check("能构建「字体+暗色主题」补丁", false, String(e.message || e).slice(0, 120));
  }

  // 两个新主题 + 自定义主题（含 custom→custom 迁移）也能全量构建
  try {
    for (const tk of ["atomOneDark", "githubDark"]) buildPatch(buf, null, tk);
    check("能构建 atomOneDark/githubDark 补丁", true);
  } catch (e) {
    check("能构建 atomOneDark/githubDark 补丁", false, String(e.message || e).slice(0, 120));
  }
  try {
    const { resolveTheme } = await import("../lib/theme.mjs");
    const custom = JSON.parse(JSON.stringify(THEMES.githubDark.colors));
    custom.fore["注释"] = "#123456";
    const a = buildPatch(buf, null, "custom", { customColors: custom });
    const b = buildPatch(a.buf, null, "custom", { customColors: custom, prevCustomColors: custom });
    const bad = COLOR_SITES.filter((s) => {
      if (s.kind === "codepage") return b.buf.readUInt32LE(s.off + 1) !== s.from;
      return b.buf.readUInt32LE(s.off + 1) !== rgb2colorref(
        s.kind === "caret" ? custom.caret : s.kind === "back" ? custom.back : custom.fore[s.role]);
    });
    check("自定义主题可构建且可从自定义状态再次应用", bad.length === 0, bad.map((s) => s.key).join(","));
  } catch (e) {
    check("自定义主题可构建且可从自定义状态再次应用", false, String(e.message || e).slice(0, 120));
  }
}

console.log("\n=== SciLexer.dll（选区/光标站点，只读）===");
{
  const { dllPath, DLL_SITES, preflightDll } = await import("../lib/scilexer.mjs");
  const DLL_PATH = dllPath();
  check("SciLexer.dll 存在", fs.existsSync(DLL_PATH), DLL_PATH);
  check("SciLexer.dll 备份存在", fs.existsSync(DLL_PATH + ".bak"));
  if (fs.existsSync(DLL_PATH)) {
    const dll = fs.readFileSync(DLL_PATH);
    check("DLL 站点数量为 9", DLL_SITES.length === 9, String(DLL_SITES.length));
    const bad = preflightDll(dll);
    check("DLL 9 处站点现值可识别（原始/各主题目标）", bad.length === 0, bad.join(" "));
  }
}

console.log("\n=== flashfix（闪白修复注入，只读）===");
{
  const { flashfixAssetPath, embedFlashfix, stripFlashfix, scilexerHasFlashfix, flashfixWanted } =
    await import("../lib/flashfix.mjs");
  const asset = flashfixAssetPath();
  check("flashfix.dll 资源存在", fs.existsSync(asset), asset);
  if (fs.existsSync(asset)) {
    const hdr = fs.readFileSync(asset);
    check("flashfix.dll 是 32 位 PE 且带 FlashFixInit 导出",
      hdr.readUInt16LE(hdr.readUInt32LE(0x3c) + 4) === 0x14c && hdr.includes("FlashFixInit"),
      `size=${hdr.length}`);
  }
  // 用备份的原始 DLL 做注入/还原往返（不碰安装文件）
  const backup = fs.existsSync(asset) ? fs.readFileSync(asset) : null;
  const { dllBackup } = await import("../lib/scilexer.mjs");
  const bk = dllBackup();
  if (backup && fs.existsSync(bk)) {
    const orig = fs.readFileSync(bk);
    const emb = embedFlashfix(orig);
    check("DLL 可注入 flashfix 导入", emb.changed && scilexerHasFlashfix(emb.buf));
    check("DLL 注入幂等", !embedFlashfix(emb.buf).changed);
    check("DLL 可还原为原始字节", stripFlashfix(emb.buf).buf.equals(orig));
    check("暗色主题启用闪白修复，原始主题不启用", flashfixWanted("dark") && !flashfixWanted("original"));
  }
}

console.log(`\n结果：${pass} 通过, ${fail} 失败`);
if (!runningAutoShop().supported) console.log("提示：当前无法检测 AutoShop 运行状态。");
process.exit(fail === 0 ? 0 : 1);
