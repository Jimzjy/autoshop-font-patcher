/**
 * SciLexer.dll 补丁：暗色主题下的选区底色与白色光标。
 * DLL 里的这四处是 Scintilla ViewStyle 构造函数与光标位图填充的硬编码默认值，
 * exe 侧消息改不动，必须直接补字节；应用「亮色」时还原为原始值。
 *
 * 站点（文件偏移，DLL ImageBase 0x10000000，.text VA=file+0xC00）：
 *  - 0x52026  VA 0x10052C26  `6A 00`→`6A FF`  光标位图 memset 填充值 0→0xFF（黑→白光标）
 *  - 0x54B2F / 0x54B4F / 0x54BC5  imm32 `C0 C0 C0 00`→`26 4F 78 00`
 *    ViewStyle 构造三处默认色：selection #C0C0C0、selBackground2 #B0B0B0(+0x2D90)、第三处银灰 → #264F78
 */
import fs from "node:fs";
import path from "node:path";
import { fonts } from "./patch.mjs";
import { THEMES, resolveColors, rgb2colorref } from "./theme.mjs";
import {
  embedFlashfix, stripFlashfix, flashfixWanted, deployFlashfix,
  getFlashfixStatus, scilexerHasFlashfix,
} from "./flashfix.mjs";

// 惰性求值：patch.mjs 与本模块相互引用，模块顶层时 fonts 尚未初始化
export function dllPath() { return path.join(path.dirname(fonts.EXE), "SciLexer.dll"); }
export function dllBackup() { return dllPath() + ".bak"; }

const CARET = { key: "dll-caret", off: 0x52026, from: Buffer.from([0x6a, 0x00]), to: Buffer.from([0x6a, 0xff]), label: "白色光标" };
const SEL_BYTES = { from: Buffer.from([0xc0, 0xc0, 0xc0, 0x00]), to: Buffer.from([0x26, 0x4f, 0x78, 0x00]) };

// Style 默认构造的白底（FF FF FF 00）。控件新建/切窗口重绘的瞬间用的是这个默认值，
// 不改它暗色下切窗口会闪白。目标色跟随主题背景色（original → 还原白色）。
const STYLE_BACK_FROM = Buffer.from([0xff, 0xff, 0xff, 0x00]);
const styleBackSites = [
  { key: "dll-styleback1", off: 0x54a54, label: "默认样式底色(STYLE_DEFAULT)" }, // VA 0x1005564A
  { key: "dll-styleback2", off: 0x54025, label: "默认样式底色(Style构造)" },     // VA 0x10054C25
  { key: "dll-styleback3", off: 0x5406d, label: "默认样式底色(Style复制)" },     // VA 0x10054C6D
  { key: "dll-styleback4", off: 0x54b6b, label: "ViewStyle成员+0x2DA8 白底" },   // VA 0x1005576B
  { key: "dll-styleback5", off: 0x54bf7, label: "ViewStyle成员+0x2DE8 白底" },   // VA 0x100557F7
];

/** 目标字节：固定站点用 s.to；样式底色站点按主题背景色生成。original → 原始字节。 */
function targetBytes(s, themeKey, customColors) {
  if (s.to) return themeKey === "original" ? s.from : s.to;
  if (themeKey === "original") return s.from;
  const back = resolveColors(themeKey, customColors).back;
  const cr = rgb2colorref(back);
  return Buffer.from([cr & 0xff, (cr >> 8) & 0xff, (cr >> 16) & 0xff, 0x00]);
}

/** 站点现值允许集合：原始字节 ∪ 所有可能目标（内置主题 + 自定义传入）。 */
function allowedSet(s, customColors, prevColors = null) {
  const set = [s.from];
  for (const key of Object.keys(THEMES)) {
    if (key !== "original") set.push(targetBytes(s, key));
  }
  for (const colors of [customColors, prevColors]) {
    if (colors && colors.back) {
      const cr = rgb2colorref(colors.back);
      set.push(Buffer.from([cr & 0xff, (cr >> 8) & 0xff, (cr >> 16) & 0xff, 0x00]));
    }
  }
  return set;
}

export const DLL_SITES = [
  CARET,
  { key: "dll-sel1", off: 0x54b2f, ...SEL_BYTES, label: "选区底色" },
  { key: "dll-sel2", off: 0x54b4f, ...SEL_BYTES, label: "选区底色2" },
  { key: "dll-sel3", off: 0x54bc5, ...SEL_BYTES, label: "选区底色3" },
  ...styleBackSites.map((s) => ({ ...s, from: STYLE_BACK_FROM })),
];

function assertDllFile() {
  if (!fs.existsSync(dllPath())) throw new Error("找不到 " + dllPath());
}

/** 逐站点检查现值：每个站点必须 ∈ {原始, 目标}，否则中止（fail-closed）。 */
export function preflightDll(buf, customColors = null, prevColors = null) {
  const bad = [];
  for (const s of DLL_SITES) {
    const cur = buf.subarray(s.off, s.off + s.from.length);
    if (!allowedSet(s, customColors, prevColors).some((b) => cur.equals(b))) {
      bad.push(`${s.key}@0x${s.off.toString(16)} 现值=${cur.toString("hex")}`);
    }
  }
  return bad;
}

/**
 * 按 themeKey 应用/还原 DLL 补丁（暗色及自定义主题 → 打上；original → 还原）。
 * 同时维护闪白修复：暗色主题给 DLL 挂 flashfix.dll 导入并部署修复 DLL/ini，
 * 亮色主题摘掉导入。返回 { changed, dllPatched, flashfix }。首次改动前自动备份。
 */
export function applyDllTheme(themeKey, customColors = null, prevColors = null) {
  assertDllFile();
  let buf = fs.readFileSync(dllPath());
  const bad = preflightDll(buf, customColors, prevColors);
  if (bad.length) {
    throw new Error("SciLexer.dll 现值与预期不符，已中止（" + bad.join("; ") + "）。" +
      (fs.existsSync(dllBackup()) ? " 可用 .bak 手动恢复。" : ""));
  }
  let changed = 0;
  for (const s of DLL_SITES) {
    const target = targetBytes(s, themeKey, customColors);
    const cur = buf.subarray(s.off, s.off + target.length);
    if (cur.equals(target)) continue;
    target.copy(buf, s.off);
    changed++;
  }

  // 闪白修复：暗色 → 挂 flashfix.dll 导入 + 部署 DLL/ini；亮色 → 摘掉导入
  const wantFix = flashfixWanted(themeKey, customColors);
  const ff = wantFix ? embedFlashfix(buf) : stripFlashfix(buf);
  buf = ff.buf;
  if (wantFix) deployFlashfix(resolveColors(themeKey, customColors).back);

  const dllPatched = themeKey !== "original";
  if (changed > 0 || ff.changed) {
    if (!fs.existsSync(dllBackup())) fs.copyFileSync(dllPath(), dllBackup());
    fs.writeFileSync(dllPath(), buf);
  }
  return { changed, dllPatched, flashfix: wantFix, flashfixChanged: ff.changed };
}

/** 读取 DLL 当前补丁状态（供 status 展示）。 */
export function getDllStatus() {
  if (!fs.existsSync(dllPath())) return { exists: false };
  const buf = fs.readFileSync(dllPath());
  const rows = DLL_SITES.map((s) => {
    const cur = buf.subarray(s.off, s.off + s.from.length);
    const isOriginal = cur.equals(s.from);
    const isThemed = !isOriginal &&
      allowedSet(s).some((b) => cur.equals(b)) && !cur.equals(s.from);
    return {
      key: s.key,
      off: "0x" + s.off.toString(16),
      label: s.label,
      state: isOriginal ? "原始" : isThemed ? "已应用" : "不符",
    };
  });
  return {
    exists: true,
    backupExists: fs.existsSync(dllBackup()),
    allValid: rows.every((r) => r.state !== "不符"),
    sites: rows,
    flashfix: getFlashfixStatus(buf),
  };
}
