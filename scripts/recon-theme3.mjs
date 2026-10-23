// 临时侦察：全文件扫 68 <color> 6a <style> 形态，找已知配色函数之外的着色站点
import { readFileSync } from "node:fs";
const buf = readFileSync("C:/Inovance Control/AutoShop/AutoShop.exe");
const inKnown = (o) => o >= 0xEEECA4 && o <= 0xEEF337;
const hits = [];
for (let i = 0x400; i < buf.length - 8; i++) {
  if (buf[i] !== 0x68) continue;
  const imm = buf.readUInt32LE(i + 1);
  if (imm === 0 || imm > 0xffffff) continue;
  if (buf[i + 5] !== 0x6a) continue;
  const st = buf[i + 6];
  if (st > 0x40) continue;
  if (inKnown(i)) continue;
  hits.push({ off: i, imm, st });
}
console.log("函数外命中:", hits.length);
for (const h of hits) console.log("0x" + h.off.toString(16), "color=0x" + h.imm.toString(16).padStart(6, "0"), "style=" + h.st);
