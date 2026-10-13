/**
 * PE32 只读解析：段表与文件偏移/虚拟地址换算。
 *
 * 两条关键规则：
 * 1. 文件偏移不是 RVA，换算必须经段表。
 * 2. 只有段内偏移小于 VirtSize 的数据才会被加载进内存 —— 段的 RawSize
 *    通常大于 VirtSize，超出部分只存在于文件。
 */
import fs from "node:fs";

/** 读取段表与映像基址。 */
export function parsePe(buf) {
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt16LE(pe) !== 0x4550) throw new Error("不是有效的 PE 文件");
  const numSec = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  const magic = buf.readUInt16LE(pe + 24);
  const imageBase = buf.readUInt32LE(pe + 24 + 28);
  const secStart = pe + 24 + optSize;
  const secs = [];
  for (let i = 0; i < numSec; i++) {
    const o = secStart + i * 40;
    secs.push({
      name: buf.toString("ascii", o, o + 8).replace(/\0+$/, ""),
      vsize: buf.readUInt32LE(o + 8),
      vaddr: buf.readUInt32LE(o + 12),
      rsize: buf.readUInt32LE(o + 16),
      rptr: buf.readUInt32LE(o + 20),
      chars: buf.readUInt32LE(o + 36),
    });
  }
  return { is64: magic === 0x20b, imageBase, secs };
}

/** 文件偏移所在段。 */
export function sectionAt(pe, off) {
  return pe.secs.find((s) => off >= s.rptr && off < s.rptr + s.rsize) ?? null;
}

/** 文件偏移 -> 绝对虚拟地址。绝不能用 off + imageBase。 */
export function offsetToAbs(pe, off) {
  const s = sectionAt(pe, off);
  return s ? s.vaddr + (off - s.rptr) + pe.imageBase : null;
}

/** 文件偏移是否落在该段会被加载的范围（VirtSize）内。 */
export function isLoadable(pe, off) {
  const s = sectionAt(pe, off);
  return Boolean(s) && off - s.rptr < s.vsize;
}

/** 便捷：直接对文件路径做一次体检。 */
export function inspectSlot(exePath, slotOff) {
  const buf = fs.readFileSync(exePath);
  const pe = parsePe(buf);
  const s = sectionAt(pe, slotOff);
  return {
    ok: isLoadable(pe, slotOff),
    section: s?.name ?? null,
    va: offsetToAbs(pe, slotOff),
    imageBase: pe.imageBase,
    reason: s ? (isLoadable(pe, slotOff) ? null : "超出该段 VirtSize，加载后不会被映射") : "不在任何段内",
  };
}
