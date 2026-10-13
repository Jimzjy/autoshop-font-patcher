// 端到端自检：对运行中的界面服务跑一遍接口与行为测试。
//
// 用法：node scripts/e2e.mjs
//   若 AutoShop 正在运行，会自动跳过所有写入类测试，只验证只读接口与拦截逻辑。
//
// 环境变量 UI_BASE 可指定服务地址，默认 http://127.0.0.1:8791
const BASE = process.env.UI_BASE || "http://127.0.0.1:8791";

async function call(path, opts) {
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const post = (p, body) => call(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let pass = 0, fail = 0, skip = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${detail ?? ""}`); }
};
const skipTest = (name, why) => { skip++; console.log(`  – ${name}（跳过：${why}）`); };

console.log(`AutoShop 字体工具 · 端到端自检\n服务：${BASE}\n`);

let state;
try {
  state = (await call("/api/state")).json;
} catch (e) {
  console.error("无法连接服务：" + e.message);
  console.error("请先运行：node bin/autoshop-font-ui.mjs");
  process.exit(1);
}

console.log("=== 页面与状态 ===");
{
  const r = await call("/");
  check("GET / 返回 HTML", r.status === 200 && r.text.startsWith("<!DOCTYPE"), `status=${r.status}`);
  check("页面含标题", r.text.includes("AutoShop 字体切换"));
  check("状态可读", state?.ok !== false && state?.exists === true);
  check("7 处站点全部有效", state?.allSitesValid === true && state?.sites?.length === 7);
  check("落点体检通过", state?.slotCheck?.ok === true, state?.slotCheck?.reason ?? "");
  console.log(`     当前字体=${state?.recordedFont ?? "(无)"}  空闲区="${state?.slotName}"  哈希=${state?.hash?.slice(0, 16)}…`);
}

const busy = !state?.running?.supported || (state?.running?.processes?.length ?? 0) > 0;
console.log(`\n=== 运行检测 ===`);
console.log(`     检测可用=${state?.running?.supported}  运行中=${state?.running?.processes?.length ?? "?"}  路径不可读=${state?.running?.unreadablePath ?? 0}`);
if (busy) console.log("     → AutoShop 正在运行或检测不可用，将跳过写入类测试");

console.log("\n=== 诊断接口 ===");
{
  const r = await call("/api/whoami");
  check("whoami 可读", r.status === 200 && typeof r.json?.pid === "number");
  check("能报告端口归属", r.json?.portOwner?.pid === r.json?.pid || r.json?.portOwner != null,
    JSON.stringify(r.json?.portOwner));
  console.log(`     本服务 PID=${r.json?.pid}  端口=${r.json?.port}  占端口进程=${r.json?.portOwner?.name}(${r.json?.portOwner?.pid})`);
}

console.log("\n=== 字体列表 ===");
{
  const r = await call("/api/fonts");
  const fonts = r.json.fonts;
  check("返回字体数组", Array.isArray(fonts) && fonts.length > 50, `count=${fonts?.length}`);
  check("包含 Consolas", fonts?.includes("Consolas"));
  check("未安装的字体不出现在列表里", !fonts?.includes("Lucida Sans Typewriter"));
}

console.log("\n=== 输入校验（应全部被拒绝）===");
for (const [name, font, want] of [
  ["超长字体名", "A".repeat(60), "超过上限"],
  ["非 ASCII 字体名", "宋体", "ASCII"],
  ["空字体名", "", "不能为空"],
]) {
  const r = await post("/api/apply", { font });
  const err = r.json?.error ?? "";
  check(`${name} 被拒绝`, r.status === 400 && r.json?.ok === false && err.includes(want),
    `status=${r.status} error=${JSON.stringify(err.slice(0, 70))}`);
}

console.log("\n=== 运行拦截 ===");
if (busy) {
  const r = await post("/api/apply", { font: "Courier New" });
  check("运行中拒绝切换字体", r.status === 400 && r.json?.ok === false, `status=${r.status}`);
  console.log(`     理由：${(r.json?.error ?? "").split("\n")[0]}`);
} else {
  skipTest("运行拦截", "AutoShop 未运行，无需拦截");
}

if (busy) {
  console.log("\n以下写入类测试已跳过（关闭 AutoShop 后重跑本脚本即可完整验证）：");
  for (const t of ["应用 exe 内置字体", "应用自定义字体（写入空闲区）", "还原", "还原后重新应用"]) {
    skipTest(t, "AutoShop 运行中");
  }
} else {
  const originalFont = state.recordedFont;
  console.log("\n=== 应用 exe 内置字体 ===");
  {
    const r = await post("/api/apply", { font: "Lucida Sans Unicode" });
    check("应用成功", r.status === 200 && r.json.ok === true, JSON.stringify(r.json?.error));
    check("标记为内置", r.json?.builtin === true);
    check("7 处全部指向它", r.json?.state?.sites?.every((s) => s.target === "Lucida Sans Unicode"));
    check("文件大小不变", r.json?.size === state.size);
  }

  console.log("\n=== 应用自定义字体（写入空闲区）===");
  {
    const r = await post("/api/apply", { font: "Cascadia Mono" });
    check("应用成功", r.status === 200 && r.json.ok === true, JSON.stringify(r.json?.error));
    check("标记为自定义", r.json?.builtin === false);
    check("空闲区已写入", r.json?.state?.slotName === "Cascadia Mono");
    check("7 处全部指向它", r.json?.state?.sites?.every((s) => s.target === "Cascadia Mono"));
  }

  console.log("\n=== 还原 ===");
  {
    const r = await post("/api/revert", {});
    check("还原成功", r.status === 200 && r.json.ok === true, JSON.stringify(r.json?.error));
    check("哈希与原始一致", r.json?.matchesOriginal === true, `hash=${r.json?.hash?.slice(0, 16)}`);
  }

  console.log("\n=== 还原后重新应用（恢复原状态）===");
  {
    const r = await post("/api/apply", { font: originalFont ?? "Consolas" });
    check("重新应用成功", r.status === 200 && r.json.ok === true, JSON.stringify(r.json?.error));
    console.log(`     已恢复到：${r.json?.font}`);
  }
}

console.log(`\n结果：${pass} 通过, ${fail} 失败${skip ? `, ${skip} 跳过` : ""}`);
process.exit(fail === 0 ? 0 : 1);
