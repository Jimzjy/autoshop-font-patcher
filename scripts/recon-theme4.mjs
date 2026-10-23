// 临时侦察：全部 FORE/BACK 调用点 → 精确提取 (colorPushOff, color, stylePush) 按簇分组
import { readFileSync } from "node:fs";
const buf = readFileSync("C:/Inovance Control/AutoShop/AutoShop.exe");
const FORE = 0x7d0510, BACK = 0x7d0560;
const calls = [];
for (let i = 0x400; i < buf.length - 5; i++) {
  if (buf[i] !== 0xe8) continue;
  const tgt = (i + 5 + buf.readInt32LE(i + 1)) >>> 0;
  if (tgt === FORE || tgt === BACK) calls.push({ off: i, kind: tgt === FORE ? "F" : "B" });
}
// 每个调用点：在 call 前 20 字节内找 68 imm32(颜色) 和 6a XX(样式)
const rows = [];
for (const c of calls) {
  let color = null, colorOff = null, style = null;
  for (let j = c.off - 1; j > c.off - 24 && j > 0; j--) {
    if (buf[j] === 0x6a && style === null && j < c.off - 2) style = buf[j + 1];
    if (buf[j] === 0x68 && color === null) {
      const imm = buf.readUInt32LE(j + 1);
      color = imm; colorOff = j;
    }
  }
  rows.push({ kind: c.kind, callOff: c.off, colorOff, color, style });
}
// 按簇分组（colorOff 间距 >0x400 视为新一簇）
rows.sort((a, b) => (a.colorOff ?? 0) - (b.colorOff ?? 0));
let clusterStart = null, last = null, clusterNo = 0;
for (const r of rows) {
  const o = r.colorOff ?? r.callOff;
  if (clusterStart === null || o - last > 0x800) { clusterNo++; console.log(`\n—— 簇 ${clusterNo} 起 0x${o.toString(16)} ——`); clusterStart = o; }
  last = o;
  const cs = r.color == null ? "addr/?" : "0x" + r.color.toString(16).padStart(6, "0");
  const rr = r.color & 0xff, gg = (r.color >> 8) & 0xff, bb = (r.color >> 16) & 0xff;
  console.log(`${r.kind} call@0x${r.callOff.toString(16)} colorPush@0x${(r.colorOff ?? 0).toString(16)} ${cs} (#${rr.toString(16).padStart(2,"0")}${gg.toString(16).padStart(2,"0")}${bb.toString(16).padStart(2,"0")}) style=${r.style ?? "?"}`);
}
console.log("\n总行数:", rows.length);
