/**
 * AutoShop 字体补丁核心。
 *
 * ## 原理
 * AutoShop 的代码编辑器基于 Scintilla，字体名是编译期常量：初始化代码用
 * `push imm32` 把字符串地址压栈，紧接着 `call 0xBD12A0` —— 该函数内部依次发出
 * SCI_STYLESETFONT(2050) 与 SCI_STYLESETCHARACTERSET(2066)。全 exe 共 7 处
 * 属于这套字体初始化代码。
 *
 * 因此只需改写这 7 处 push 的立即数，让其统一指向同一个字体名字符串。
 * 不增删任何字节，文件大小不变。
 *
 * 字体名字符串有两种来源：
 *   - exe 里本来就有（Consolas / Lucida Sans Typewriter / Lucida Sans Unicode）
 *   - 写入 .rdata 中的一处空闲区（需满足"无代码引用"且"在 VirtSize 内"）
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { parsePe, offsetToAbs, isLoadable } from "./pe.mjs";
import { THEMES, preflightTheme, applyThemeTo } from "./theme.mjs";
import { applyDllTheme, getDllStatus, dllPath as DLL_PATH, dllBackup as DLL_BACKUP } from "./scilexer.mjs";

const EXE = "C:\\Inovance Control\\AutoShop\\AutoShop.exe";

/** 本工具适配并测试过的 AutoShop 版本。地址与偏移均以此版本为准。 */
export const SUPPORTED_VERSION = "V4.12.0.2";

/** exe 中已有的字体名字符串。地址为绝对虚拟地址。 */
export const BUILTIN_FONTS = [
  { name: "Consolas", addr: 0x1fe11f0 },
  { name: "Lucida Sans Typewriter", addr: 0x1fe11fc },
  { name: "Lucida Sans Unicode", addr: 0x1fe13bc },
];

/**
 * .rdata 中的可写空闲区，用于写入 exe 里没有的字体名。
 * 选取条件：① 无任何代码引用 ② 段内偏移小于 VirtSize（保证会被加载进内存）
 *           ③ 前后相邻数据不被覆盖
 */
export const SLOT = { off: 0x1b2c7a9, capacity: 60 };

/**
 * 7 处字体初始化站点。
 * off  = push 指令的文件偏移（已逐字节核对）
 * from = 它原本压入的字体名字符串地址
 */
export const SITES = [
  { key: "site1", off: 0x00eeed1d, va: 0x12ef91d, from: 0x1fe11f0 },
  { key: "site2", off: 0x00eeeceb, va: 0x12ef8eb, from: 0x1fe11fc },
  { key: "site3", off: 0x0105ea5b, va: 0x111fa5b, from: 0x1fe11fc },
  { key: "site4", off: 0x01123507, va: 0x122e507, from: 0x1fe11fc },
  { key: "site5", off: 0x0114faab, va: 0x1258aab, from: 0x1fe11fc },
  { key: "site6", off: 0x0038e4fe, va: 0x48f4fe, from: 0x1f13894 },
  { key: "site7", off: 0x0057db95, va: 0x61ab95, from: 0x1f13894 },
];

export const fonts = { EXE, backup: EXE + ".bak", meta: EXE + ".patch.json", orig: EXE + ".orig.json" };

export const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const le32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
export const readFontTarget = (buf, off) => buf.readUInt32LE(off + 1);
export const isPushImm32 = (buf, off) => buf[off] === 0x68;
const expected = (from) => Buffer.concat([Buffer.from([0x68]), le32(from)]);

/** 读取 .rdata 里的 C 字符串。 */
export function readCString(buf, off, max = 64) {
  let e = off;
  while (e < buf.length && buf[e] !== 0 && e - off < max) e++;
  return buf.subarray(off, e).toString("ascii");
}

/** 读 JSON，容忍 UTF-8 BOM。 */
export function loadJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); } catch { return {}; }
}

/**
 * 落点体检：确认 SLOT 的虚拟地址会被加载进内存。
 * 段内偏移超出 VirtSize 时写入无效，因此这里作为写入前的硬性闸门。
 */
export function checkSlot(buf) {
  const pe = parsePe(buf);
  return {
    ok: isLoadable(pe, SLOT.off),
    section: pe.secs.find((s) => SLOT.off >= s.rptr && SLOT.off < s.rptr + s.rsize)?.name ?? null,
    va: offsetToAbs(pe, SLOT.off),
    reason: isLoadable(pe, SLOT.off) ? null : "落点超出该段 VirtSize，加载后不会被映射",
  };
}

/** 逐站点校验当前字节，判断处于「原始」还是「已打补丁」。 */
export function preflight(buf) {
  return SITES.map((s) => {
    const actual = buf.subarray(s.off, s.off + 5);
    const pushOk = isPushImm32(buf, s.off);
    return {
      key: s.key,
      off: s.off,
      isOriginal: actual.equals(expected(s.from)),
      pushOk,
      target: pushOk ? readFontTarget(buf, s.off) : null,
      bytes: actual.toString("hex"),
    };
  });
}

/** 把目标地址描述成人类可读的名字。 */
export function describeTarget(target, slotAbs, slotName) {
  const b = BUILTIN_FONTS.find((f) => f.addr === target);
  if (b) return b.name;
  if (slotAbs != null && target === slotAbs) return slotName || "(落点)";
  return "0x" + target.toString(16);
}

/**
 * 生成打过补丁的文件内容（不落盘）。字体与配色相互独立：只改传入的维度，
 * 另一个维度的字节保持现状不动。
 * @param {Buffer} src 当前 exe 内容
 * @param {string|null} fontName 目标字体名；null = 不改字体（保留现状）
 * @param {string|null} themeKey 主题 key（含 "original" = 恢复原始配色）；null = 不改配色
 * @returns {{buf: Buffer, font: string|null, builtin: boolean, changed: string[], theme: string|null, themeChanged: string[], slotAbs: number|null}}
 */
export function buildPatch(src, fontName = null, themeKey = null, { customColors = null, prevCustomColors = null } = {}) {
  const useFont = fontName != null && String(fontName).trim() !== "";
  if (!useFont && themeKey == null) throw new Error("至少指定 font 或 theme 之一");
  if (themeKey === "custom" && !customColors) throw new Error("自定义主题需要提供 colors");

  const buf = Buffer.from(src);
  let font = null;
  let builtin = false;
  let slotAbs = null;
  const changed = [];

  if (useFont) {
    const name = String(fontName).trim();
    const b = BUILTIN_FONTS.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (!b) {
      if (!/^[\x20-\x7e]+$/.test(name)) throw new Error("字体名必须是纯 ASCII 可见字符");
      if (name.length > SLOT.capacity - 1) throw new Error(`字体名 ${name.length} 字符，超过上限 ${SLOT.capacity - 1}`);
    }

    const rows = preflight(buf);
    const bad = rows.filter((r) => !r.pushOk);
    if (bad.length) throw new Error("以下站点不是 push 指令，文件版本可能不符：\n" + bad.map((r) => `  ${r.key} @0x${r.off.toString(16)}`).join("\n"));

    let addr;
    if (b) {
      addr = b.addr;
    } else {
      const slot = checkSlot(buf);
      if (!slot.ok) throw new Error(`字体名落点无效（0x${SLOT.off.toString(16)}）：${slot.reason}`);
      buf.fill(0, SLOT.off, SLOT.off + SLOT.capacity); // 清掉上一个字体名，避免残留
      Buffer.from(name + "\0", "ascii").copy(buf, SLOT.off);
      addr = slot.va;
      slotAbs = slot.va;
    }

    for (const s of SITES) {
      if (readFontTarget(buf, s.off) === addr) continue;
      le32(addr).copy(buf, s.off + 1);
      changed.push(s.key);
    }
    font = b ? b.name : name;
    builtin = Boolean(b);
  }

  let themeChanged = [];
  if (themeKey != null) {
    if (themeKey !== "custom" && themeKey !== "original" && !THEMES[themeKey]) {
      throw new Error(`未知主题：${themeKey}（可用：${Object.keys(THEMES).join(", ")}, original, custom）`);
    }
    themeChanged = applyThemeTo(buf, themeKey, customColors, prevCustomColors);
  }
  if (buf.length !== src.length) throw new Error("内部错误：字节数发生变化");

  return { buf, font, builtin, changed, theme: themeKey, themeChanged, slotAbs };
}

/**
 * 执行打补丁并落盘，自动创建备份与记录。字体与配色相互独立：
 * 只应用传入的维度，另一个维度保留上次应用的值（元数据同步保留）。
 * @param {{font?: string|null, theme?: string|null, colors?: object|null}} opts
 *   font  为 null 时不动字体；theme 为 null 时不动配色；theme 传 "original" 恢复原始配色；
 *   theme 传 "custom" 时 colors 必填（{caret, back, fore:{角色:hex}}）。
 */
export function applyPatch({ font = null, theme = null, colors = null } = {}) {
  if (!fs.existsSync(EXE)) throw new Error("找不到 " + EXE);
  const src = fs.readFileSync(EXE);
  const prevMeta = loadJson(fonts.meta);
  const built = buildPatch(src, font, theme, {
    customColors: colors,
    prevCustomColors: prevMeta.customColors ?? null,
  });
  const useFont = built.font != null;
  const useTheme = theme != null;

  if (!fs.existsSync(fonts.backup)) {
    fs.copyFileSync(EXE, fonts.backup);
    fs.writeFileSync(fonts.orig, JSON.stringify({
      originalSha256: sha256(fs.readFileSync(fonts.backup)),
      originalSize: fs.statSync(fonts.backup).size,
      savedAt: new Date().toISOString(),
      note: "原始 AutoShop.exe 备份。保留此文件才能一键还原。",
    }, null, 2), "utf8");
  }

  const patched = sha256(built.buf);
  const prev = loadJson(fonts.meta);
  const finalFont = useFont ? built.font : (prev.fontName ?? null);
  const finalTheme = useTheme ? theme : (prev.theme ?? null);
  // 自定义色表：本次提供了就更新记录；没提供（只改字体）保留上次记录
  const finalCustomColors = useTheme && theme === "custom"
    ? customColors
    : (prev.customColors ?? null);
  fs.writeFileSync(EXE, built.buf);
  // 配色维度联动 SciLexer.dll（选区底色/白光标/闪白修复）：暗色及自定义主题打上，亮色还原
  let dll = { changed: 0, dllPatched: prevMeta.dllPatched ?? false, flashfix: false, flashfixChanged: false };
  if (useTheme) dll = applyDllTheme(theme, finalCustomColors, prevMeta.customColors ?? null);
  fs.writeFileSync(fonts.meta, JSON.stringify({
    patchedSha256: patched,
    patchedSize: built.buf.length,
    fontName: finalFont,
    fontIsBuiltin: useFont ? built.builtin : (prev.fontIsBuiltin ?? null),
    appliedSites: useFont ? built.changed : (prev.appliedSites ?? []),
    theme: finalTheme,
    themeAppliedSites: useTheme ? built.themeChanged : (prev.themeAppliedSites ?? []),
    customColors: finalCustomColors,
    dllPatched: dll.dllPatched,
    flashfix: useTheme ? dll.flashfix : (prev.flashfix ?? false),
    slotAbs: useFont ? built.slotAbs : (prev.slotAbs ?? null),
    autoShopVersion: SUPPORTED_VERSION,
    appliedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return {
    font: finalFont,
    fontChanged: useFont,
    changed: built.changed,
    builtin: built.builtin,
    theme: finalTheme,
    themeChanged: useTheme ? built.themeChanged : [],
    dllChanged: dll.changed,
    dllPatched: dll.dllPatched,
    flashfix: useTheme ? dll.flashfix : (prev.flashfix ?? false),
    flashfixChanged: dll.flashfixChanged,
    hash: patched,
    size: built.buf.length,
  };
}

/** 从备份完整还原。会先核对当前哈希，避免覆盖你后来的改动。 */
export function revertPatch({ force = false } = {}) {
  if (!fs.existsSync(fonts.backup)) throw new Error("找不到备份 " + fonts.backup + "，无法还原");
  const meta = loadJson(fonts.meta);
  const cur = sha256(fs.readFileSync(EXE));
  if (!force && meta.patchedSha256 && cur !== meta.patchedSha256) {
    throw new Error(
      "当前文件哈希与记录不符，可能被其他程序改动过，已中止以免覆盖你的改动。\n" +
      `  当前：${cur}\n  记录：${meta.patchedSha256}\n` +
      `如确认要强制还原，请手动用备份覆盖，或使用 force 选项。`
    );
  }
  fs.copyFileSync(fonts.backup, EXE);
  // SciLexer.dll 一并还原（若有备份）
  let dllRestored = false;
  if (fs.existsSync(DLL_BACKUP)) {
    fs.copyFileSync(DLL_BACKUP, DLL_PATH());
    dllRestored = true;
  } else if (getDllStatus().sites.some((s) => s.state === "已应用")) {
    throw new Error("exe 已还原，但找不到 SciLexer.dll 备份，DLL 补丁无法还原，请手动处理。");
  }
  const restored = sha256(fs.readFileSync(EXE));
  const orig = loadJson(fonts.orig);
  return { hash: restored, dllRestored, matchesOriginal: orig.originalSha256 ? restored === orig.originalSha256 : null };
}

/** 汇总当前状态，供界面与命令行共用。 */
export function getStatus() {
  if (!fs.existsSync(EXE)) return { exe: EXE, exists: false, error: "找不到 AutoShop.exe" };
  const buf = fs.readFileSync(EXE);
  const meta = loadJson(fonts.meta);
  const orig = loadJson(fonts.orig);
  const cur = sha256(buf);
  const slotName = readCString(buf, SLOT.off);
  const slot = checkSlot(buf);
  const rows = preflight(buf);

  return {
    exe: EXE,
    exists: true,
    size: buf.length,
    hash: cur,
    supportedVersion: SUPPORTED_VERSION,
    backupExists: fs.existsSync(fonts.backup),
    originalHash: orig.originalSha256 ?? null,
    isOriginal: orig.originalSha256 ? cur === orig.originalSha256 : null,
    patched: meta.patchedSha256 ? cur === meta.patchedSha256 : null,
    recordedFont: meta.fontName ?? null,
    recordedTheme: meta.theme ?? null,
    recordedCustomColors: meta.customColors ?? null,
    themeValid: meta.theme
      ? Boolean(THEMES[meta.theme]) || meta.theme === "original" || (meta.theme === "custom" && Boolean(meta.customColors))
      : null,
    dllPatched: meta.dllPatched ?? null,
    dll: getDllStatus(),
    appliedAt: meta.appliedAt ?? null,
    slotName,
    slotCapacity: SLOT.capacity,
    slotCheck: slot,
    builtinFonts: BUILTIN_FONTS.map((f) => f.name),
    allSitesValid: rows.every((r) => r.pushOk),
    themeSites: meta.theme && (THEMES[meta.theme] || meta.theme === "original" || (meta.theme === "custom" && meta.customColors))
      ? preflightTheme(buf, meta.theme, meta.customColors ?? null, meta.customColors ?? null).map((r) => ({
          key: r.key,
          off: "0x" + r.off.toString(16),
          role: r.role,
          ok: r.ok,
          state: r.isTarget ? "主题色" : r.isOriginal ? "原始" : "不符",
        }))
      : [],
    sites: rows.map((r) => ({
      key: r.key,
      off: "0x" + r.off.toString(16),
      isOriginal: r.isOriginal,
      ok: r.pushOk,
      target: r.pushOk ? describeTarget(r.target, slot.va, slotName) : "非 push 指令",
    })),
  };
}
