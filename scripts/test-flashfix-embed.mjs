/**
 * flashfix 注入离线验证（不碰安装目录）：
 *  1) 取真实 SciLexer.dll → embed → 静态校验（节表/导入目录/幂等）
 *  2) 写到临时目录，用 32 位 loader.exe 实际 LoadLibrary，验证 flashfix.dll 被拉起
 *  3) strip → 必须与原始文件逐字节一致
 *
 * 用法：node scripts/test-flashfix-embed.mjs
 * 依赖：build/flashfix/loader.exe + build/flashfix/flashfix.dll（TDM-GCC 编译，见 README 注释）
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { embedFlashfix, stripFlashfix, scilexerHasFlashfix, flashfixAssetPath } from "../lib/flashfix.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const build = path.join(repo, "build", "flashfix");
const SRC = "C:/Inovance Control/AutoShop/SciLexer.dll";
const tmp = path.join(build, "test-embed");

let fails = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
}

if (!fs.existsSync(SRC)) {
  console.log(`SKIP  找不到 ${SRC}`);
  process.exit(0);
}
if (!fs.existsSync(path.join(build, "loader.exe"))) {
  console.log(`SKIP  缺少 ${path.join(build, "loader.exe")}（gcc -m32 -o loader.exe loader.c）`);
  process.exit(0);
}

// SRC 可能已被 install 注入过：先剥回原始基线，再测 embed/strip 往返
const onDisk = fs.readFileSync(SRC);
const alreadyEmbedded = scilexerHasFlashfix(onDisk);
const src = alreadyEmbedded ? stripFlashfix(onDisk).buf : onDisk;
if (alreadyEmbedded) console.log(`INFO  安装目录 DLL 已注入，先用 strip 得到基线（${src.length} 字节）`);
const emb = embedFlashfix(src);
check("embed 生效", emb.changed);
check("embed 后识别为已注入", scilexerHasFlashfix(emb.buf));
check("embed 不改动节数据区（只动头部）", emb.buf.subarray(0x400, src.length).equals(src.subarray(0x400)));
const again = embedFlashfix(emb.buf);
check("embed 幂等", !again.changed && again.buf.equals(emb.buf));

const back = stripFlashfix(emb.buf);
check("strip 还原为原始字节", back.changed && back.buf.equals(src), `size ${back.buf.length}`);

// 加载验证
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, "SciLexer_p.dll"), emb.buf);
fs.copyFileSync(path.join(build, "loader.exe"), path.join(tmp, "loader.exe"));
fs.copyFileSync(flashfixAssetPath(), path.join(tmp, "flashfix.dll"));
let out = "";
try {
  out = execFileSync(path.join(tmp, "loader.exe"), ["SciLexer_p.dll"], { cwd: tmp, encoding: "latin1" });
} catch (e) {
  out = String(e.stdout || "") + String(e.stderr || "");
}
const m = /FLASHFIX=([0-9A-Fa-fx]+)/.exec(out);
check("加载补丁后的 SciLexer.dll 时 flashfix.dll 被拉起", Boolean(m) && m[1] !== "0" && m[1] !== "0x0", out.trim());

// 临时目录用完即清，避免在 build/flashfix 下留测试残留
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fails ? `\n${fails} 项失败` : "\n全部通过");
process.exit(fails ? 1 : 0);
