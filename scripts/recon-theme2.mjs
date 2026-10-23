// 只读侦察2：dump SCI 消息 push 站点上下文，辨认颜色参数
import { readFileSync } from 'node:fs';
const buf = readFileSync('C:/Inovance Control/AutoShop/AutoShop.exe');

function find(seq, lo = 0) {
  const p = Buffer.from(seq); const out = []; let i = lo;
  while ((i = buf.indexOf(p, i)) !== -1) { out.push(i); i++; }
  return out;
}
function hex(off, before = 40, after = 48) {
  const s = Math.max(0, off - before), e = Math.min(buf.length, off + after);
  let str = '';
  for (let i = s; i < e; i++) str += (i === off ? '[' : '') + buf[i].toString(16).padStart(2, '0') + (i === off + 4 ? ']' : '');
  return str;
}
// 从 off(=push 起始) 向前收集 push imm32 参数
function argPushes(off) {
  // 扫 off-60..off 的 68 xx xx xx xx
  const args = [];
  for (let i = Math.max(0, off - 64); i < off - 5; i++) {
    if (buf[i] === 0x68) args.push({ off: i, imm: buf.readUInt32LE(i + 1) });
  }
  return args.map(a => '0x' + a.imm.toString(16));
}
for (const msg of [2048, 2049, 2051, 2052, 2053, 2054, 2055, 2056, 2066]) {
  const seq = [0x68, msg & 0xff, (msg >> 8) & 0xff, 0x00, 0x00];
  const hits = find(seq);
  console.log(`\n===== msg ${msg}: ${hits.length} 处 =====`);
  for (const off of hits.slice(0, 12)) {
    console.log(`off=0x${off.toString(16)} 参数push(前64B内): ${argPushes(off).join(', ')}`);
    console.log('   ' + hex(off));
  }
}
