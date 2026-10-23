// 只读侦察：在 AutoShop.exe 中定位 Scintilla 样式/颜色设置调用
// 思路：Scintilla 消息经包装函数以 `push <msg>; mov edx,[reg+0x54]; call [edx]` 直调虚表。
// 扫描 .text 中所有 "push imm32" 后紧跟(容差窗口内)该虚表派发模式的 imm32，统计消息号分布。
import { readFileSync } from 'node:fs';

const EXE = 'C:/Inovance Control/AutoShop/AutoShop.exe';
const buf = readFileSync(EXE);

// 段表 (V4.12.0.2, docs/how-it-works.md §1)
const SECTIONS = [
  { name: '.text', va: 0x00001000, vsize: 0x01aaeb1c, rptr: 0x00000400, rsize: 0x01aaec00 },
  { name: '.rdata', va: 0x01ab0000, vsize: 0x0040c271, rptr: 0x01aaf000, rsize: 0x0040c400 },
];

function secAt(off) { return SECTIONS.find(s => off >= s.rptr && off < s.rptr + s.rsize) || null; }
function offToVA(off) { const s = secAt(off); return s ? (s.va + (off - s.rptr) + 0x400000) >>> 0 : null; }

// 扫描 .text 内每一条 `68 <imm32>`，看其 imm32 是否为已知 Scintilla 消息号，
// 且窗口内出现 `mov edx,[x+0x54]` (8B 51|52... 0x54) 与 `call [edx]` (FF 12)。
const TEXT = SECTIONS[0];
const MSG_CANDIDATES = new Map(); // msg -> [{off, va, callDist}]
for (let off = TEXT.rptr; off < TEXT.rptr + TEXT.rsize - 10; off++) {
  if (buf[off] !== 0x68) continue;
  const imm = buf.readUInt32LE(off + 1);
  // Scintilla 样式族消息号集中在 2000..2500；宽松收集，后面按上下文过滤
  if (imm < 2000 || imm > 2900) continue;
  // 窗口内找派发特征: 8B xx 54 ... FF 12 / FF 52 54 等，简化: 60 字节窗口内出现 "FF 12" 且前方有 8B 5x 54
  const end = Math.min(off + 90, buf.length - 2);
  let has54 = false, hasCall = false;
  for (let i = off + 5; i < end; i++) {
    if (buf[i] === 0x8b && (buf[i + 2] === 0x54 || buf[i + 2] === 0x74 || buf[i + 2] === 0x94)) has54 = true;
    if (buf[i] === 0xff && (buf[i + 1] === 0x12 || buf[i + 1] === 0x52 || buf[i + 1] === 0x51)) hasCall = true;
  }
  if (has54 && hasCall) {
    const list = MSG_CANDIDATES.get(imm) || [];
    list.push(off);
    MSG_CANDIDATES.set(imm, list);
  }
}

const rows = [...MSG_CANDIDATES.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('msg   count  sample-VA(前3)');
for (const [msg, offs] of rows) {
  const vas = offs.slice(0, 3).map(o => '0x' + offToVA(o).toString(16));
  console.log(msg.toString().padEnd(6), String(offs.length).padEnd(6), vas.join(' '));
}
