/**
 * flashfix：消除暗色主题下切窗口闪白。
 *
 * 背景：编辑器父窗口类 AfxFrameOrView90u 注册时带 (COLOR_WINDOW+1) 白色系统刷子，
 * 控件重绘前父窗口先擦一帧白。跨进程 SetClassLong 被系统拒绝（err=5），类注册在
 * mfc90u.dll（系统 WinSxS）。唯一可行路径：把进程内修复 DLL 注入 AutoShop。
 *
 * 做法：给 SciLexer.dll 追加一个导入描述符，让它加载同目录的 flashfix.dll；
 * flashfix.dll 的 DllMain 起线程，发现 Scintilla 子窗口后把父窗口类背景刷改成
 * flashfix.ini 里的颜色（= 编辑器背景色，擦除帧与底色一致，视觉不可见）。
 *
 * 追加的节 ".ffix"（VA 0x7C000）自描述：存原始 import 目录 RVA/大小、节数、
 * SizeOfImage、文件大小，stripFlashfix 据此还原（还原后字节与原始文件一致）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fonts } from "./patch.mjs";
import { resolveColors } from "./theme.mjs";

export const FLASHFIX_DLL_NAME = "flashfix.dll";
const FLASHFIX_FUNC = "FlashFixInit";
const SECTION_NAME = ".ffix";
const MARKER_MAGIC = "FFIX1\0\0\0";

export function flashfixInstalledPath() {
  return path.join(path.dirname(fonts.EXE), FLASHFIX_DLL_NAME);
}
export function flashfixIniPath() {
  return path.join(path.dirname(fonts.EXE), "flashfix.ini");
}
/** 仓库里随工具分发的 DLL 原件。 */
export function flashfixAssetPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "assets", FLASHFIX_DLL_NAME);
}

const align = (n, a) => Math.ceil(n / a) * a;

function parsePE(buf) {
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error("不是 PE 文件");
  const machine = buf.readUInt16LE(peOff + 4);
  const nsec = buf.readUInt16LE(peOff + 6);
  const optSize = buf.readUInt16LE(peOff + 20);
  const opt = peOff + 24;
  const secTable = opt + optSize;
  const sections = [];
  for (let i = 0; i < nsec; i++) {
    const o = secTable + i * 40;
    sections.push({
      name: buf.toString("ascii", o, o + 8).replace(/\0+$/, ""),
      vs: buf.readUInt32LE(o + 8),
      va: buf.readUInt32LE(o + 12),
      rs: buf.readUInt32LE(o + 16),
      raw: buf.readUInt32LE(o + 20),
      hdrOff: o,
    });
  }
  return {
    peOff,
    machine,
    nsec,
    opt,
    secTable,
    sections,
    imageBase: buf.readUInt32LE(opt + 28),
    secAlign: buf.readUInt32LE(opt + 32),
    fileAlign: buf.readUInt32LE(opt + 36),
    sizeOfImage: buf.readUInt32LE(opt + 56),
    importDirOff: opt + 96 + 8, // DataDirectory[1] = IMPORT
  };
}

function rvaToOff(pe, rva) {
  for (const s of pe.sections) {
    const span = Math.max(s.vs, s.rs);
    if (rva >= s.va && rva < s.va + span) return s.raw + (rva - s.va);
  }
  throw new Error("RVA 0x" + rva.toString(16) + " 没有对应文件偏移");
}

/** 是否已注入（最后一节名为 .ffix）。 */
export function scilexerHasFlashfix(buf) {
  const pe = parsePE(buf);
  const last = pe.sections[pe.sections.length - 1];
  return Boolean(last && last.name === SECTION_NAME);
}

/**
 * 给 SciLexer.dll 追加 .ffix 节并挂上 flashfix.dll 导入。幂等：
 * 已注入返回 changed:false。返回 { buf, changed }。
 */
export function embedFlashfix(bufIn) {
  const pe = parsePE(bufIn);
  if (pe.machine !== 0x14c) throw new Error("SciLexer.dll 不是 32 位 PE（machine=0x" + pe.machine.toString(16) + "）");
  const last = pe.sections[pe.sections.length - 1];
  if (last.name === SECTION_NAME) return { buf: bufIn, changed: false };

  const importRva = bufIn.readUInt32LE(pe.importDirOff);
  const importSize = bufIn.readUInt32LE(pe.importDirOff + 4);
  let count = 0;
  for (;;) {
    if (count > 64) throw new Error("导入描述符数量异常");
    const o = rvaToOff(pe, importRva + count * 20);
    if (bufIn.readUInt32LE(o + 12) === 0) break; // Name RVA == 0 → 终止项
    count++;
  }

  const vaEnd = Math.max(...pe.sections.map((s) => s.va + s.vs));
  const newSecVA = align(vaEnd, pe.secAlign);
  const rawOff = align(bufIn.length, pe.fileAlign);

  // ---- 组装新节内容 ----
  let cursor = 0;
  const place = (len, a = 4) => {
    cursor = align(cursor, a);
    const at = cursor;
    cursor += len;
    return at;
  };
  // 标记放在节起始处：strip 只凭节表就能定位
  const markerOff = place(28, 4);
  const descCount = count + 2; // 原描述符 + 新增 + 终止项
  const descOff = place(descCount * 20, 4);
  const dllNameOff = place(FLASHFIX_DLL_NAME.length + 1, 4);
  const hintNameOff = place(2 + FLASHFIX_FUNC.length + 1, 2);
  const iltOff = place(8, 4);
  const iatOff = place(8, 4);
  const blobSize = align(cursor, pe.fileAlign);

  const blob = Buffer.alloc(blobSize);
  const R = (o) => newSecVA + o;

  for (let i = 0; i < count; i++) {
    const src = rvaToOff(pe, importRva + i * 20);
    bufIn.copy(blob, descOff + i * 20, src, src + 20);
  }
  const d = descOff + count * 20;
  blob.writeUInt32LE(R(iltOff), d);       // OriginalFirstThunk
  blob.writeUInt32LE(0, d + 4);           // TimeDateStamp
  blob.writeUInt32LE(0, d + 8);           // ForwarderChain
  blob.writeUInt32LE(R(dllNameOff), d + 12); // Name
  blob.writeUInt32LE(R(iatOff), d + 16);  // FirstThunk
  // 终止项：Buffer.alloc 已全 0

  blob.write(FLASHFIX_DLL_NAME + "\0", dllNameOff, "latin1");
  blob.writeUInt16LE(0, hintNameOff);     // Hint
  blob.write(FLASHFIX_FUNC + "\0", hintNameOff + 2, "latin1");
  blob.writeUInt32LE(R(hintNameOff), iltOff);
  blob.writeUInt32LE(R(hintNameOff), iatOff);

  blob.write(MARKER_MAGIC, markerOff, "latin1");
  blob.writeUInt32LE(importRva, markerOff + 8);
  blob.writeUInt32LE(importSize, markerOff + 12);
  blob.writeUInt32LE(pe.nsec, markerOff + 16);
  blob.writeUInt32LE(pe.sizeOfImage, markerOff + 20);
  blob.writeUInt32LE(bufIn.length, markerOff + 24);

  // ---- 改头 ----
  const buf = Buffer.from(bufIn);
  buf.writeUInt16LE(pe.nsec + 1, pe.peOff + 6);
  buf.writeUInt32LE(R(descOff), pe.importDirOff);
  buf.writeUInt32LE(descCount * 20, pe.importDirOff + 4);
  buf.writeUInt32LE(align(newSecVA + blobSize, pe.secAlign), pe.opt + 56);

  const hdr = pe.secTable + pe.nsec * 40;
  if (hdr + 40 > pe.sections[0].raw) throw new Error("节表后没有足够空间放新节头");
  buf.write(SECTION_NAME + "\0", hdr, "latin1");
  buf.writeUInt32LE(blobSize, hdr + 8);   // VirtualSize
  buf.writeUInt32LE(newSecVA, hdr + 12);  // VirtualAddress
  buf.writeUInt32LE(blobSize, hdr + 16);  // SizeOfRawData
  buf.writeUInt32LE(rawOff, hdr + 20);    // PointerToRawData
  buf.writeUInt32LE(0, hdr + 24);
  buf.writeUInt32LE(0, hdr + 28);
  buf.writeUInt32LE(0xC0000040, hdr + 36); // INITIALIZED_DATA | READ | WRITE（loader 要写 IAT）

  const out = Buffer.concat([buf, Buffer.alloc(rawOff - buf.length), blob]);
  return { buf: out, changed: true };
}

/**
 * 摘掉 .ffix 节并还原头部字段（note：截断到原始文件大小，
 * 还原后应与注入前的原始文件逐字节一致）。返回 { buf, changed }。
 */
export function stripFlashfix(bufIn) {
  const pe = parsePE(bufIn);
  const last = pe.sections[pe.sections.length - 1];
  if (last.name !== SECTION_NAME) return { buf: bufIn, changed: false };

  const off = last.raw;
  if (bufIn.toString("latin1", off, off + 5) !== "FFIX1") {
    throw new Error("SciLexer.dll 的 .ffix 节里找不到标记，拒绝自动还原");
  }
  const importRva = bufIn.readUInt32LE(off + 8);
  const importSize = bufIn.readUInt32LE(off + 12);
  const nsec = bufIn.readUInt32LE(off + 16);
  const sizeOfImage = bufIn.readUInt32LE(off + 20);
  const fileSize = bufIn.readUInt32LE(off + 24);
  if (!(nsec >= 1 && nsec < pe.nsec && fileSize > 0 && fileSize <= bufIn.length)) {
    throw new Error("SciLexer.dll 的 .ffix 标记内容异常，拒绝自动还原");
  }

  const out = Buffer.from(bufIn.subarray(0, fileSize));
  out.writeUInt16LE(nsec, pe.peOff + 6);
  out.writeUInt32LE(importRva, pe.importDirOff);
  out.writeUInt32LE(importSize, pe.importDirOff + 4);
  out.writeUInt32LE(sizeOfImage, pe.opt + 56);
  Buffer.alloc(40).copy(out, pe.secTable + nsec * 40); // 抹掉被摘掉那节的节头
  return { buf: out, changed: true };
}

/** 该主题是否需要闪白修复：非 original 且背景足够暗。 */
export function flashfixWanted(themeKey, customColors = null) {
  if (themeKey === "original") return false;
  const back = resolveColors(themeKey, customColors).back;
  const v = parseInt(back.replace("#", ""), 16);
  const lum = 0.2126 * ((v >> 16) & 0xff) + 0.7152 * ((v >> 8) & 0xff) + 0.0722 * (v & 0xff);
  return lum < 128;
}

/** 把 flashfix.dll 部署到 AutoShop 目录，并写入 ini 颜色（RRGGBB）。 */
export function deployFlashfix(backHex) {
  const src = flashfixAssetPath();
  if (!fs.existsSync(src)) throw new Error("缺少资源文件 " + src);
  const want = fs.readFileSync(src);
  const dst = flashfixInstalledPath();
  if (!fs.existsSync(dst) || !fs.readFileSync(dst).equals(want)) fs.writeFileSync(dst, want);
  fs.writeFileSync(flashfixIniPath(), "color=" + backHex.replace("#", "").toUpperCase() + "\r\n", "ascii");
}

/** 状态展示用。 */
export function getFlashfixStatus(buf) {
  return {
    embedded: buf ? scilexerHasFlashfix(buf) : false,
    dllDeployed: fs.existsSync(flashfixInstalledPath()),
    iniExists: fs.existsSync(flashfixIniPath()),
  };
}
