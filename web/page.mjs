/**
 * 界面页面的完整 HTML（含内联样式与脚本）。
 * 单文件、无外部依赖，由 bin/autoshop-font-ui.mjs 直接返回给浏览器。
 */
export const PAGE = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoShop 字体切换</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif; background:#12141a; color:#e6e8ee; }
  .wrap { max-width:920px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:#8b93a7; font-size:13px; margin-bottom:22px; }
  .card { background:#1a1d26; border:1px solid #262b38; border-radius:10px; padding:18px 20px; margin-bottom:16px; }
  .card h2 { font-size:14px; margin:0 0 14px; color:#aab2c6; font-weight:600; letter-spacing:.4px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .grow { flex:1; min-width:240px; }
  label { color:#aab2c6; font-size:13px; display:block; margin-bottom:6px; }
  select, input { width:100%; padding:9px 11px; background:#0f1116; color:#e6e8ee; border:1px solid #2c3243; border-radius:7px; font-size:14px; font-family:inherit; }
  select:focus, input:focus { outline:none; border-color:#4c7cf3; }
  button { padding:9px 18px; border-radius:7px; border:1px solid #2c3243; background:#232838; color:#e6e8ee; font-size:14px; font-family:inherit; cursor:pointer; }
  button:hover { background:#2b3145; }
  button.primary { background:#3b62d6; border-color:#3b62d6; }
  button.primary:hover { background:#4a71e8; }
  button.danger { border-color:#5a2b2b; background:#2a1a1a; }
  button.danger:hover { background:#3a2222; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .status { display:flex; gap:10px; align-items:center; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px; flex-wrap:wrap; }
  .ok { background:#12261a; border:1px solid #1f4a2d; color:#8ee0a8; }
  .warn { background:#2a2211; border:1px solid #4d3d18; color:#e8cf8a; }
  .err { background:#2a1515; border:1px solid #4d2020; color:#f0a0a0; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid #222733; }
  th { color:#8b93a7; font-weight:600; }
  code { background:#0f1116; padding:2px 6px; border-radius:4px; font-size:12px; color:#9fc4ff; }
  .msg { margin-top:12px; padding:11px 14px; border-radius:8px; font-size:13px; white-space:pre-wrap; display:none; }
  .hint { color:#767e91; font-size:12px; margin-top:8px; }
  .kv { color:#8b93a7; font-size:12px; margin-top:10px; word-break:break-all; }
  .foot { color:#5f6678; font-size:12px; margin-top:24px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>AutoShop 字体切换</h1>
  <div class="sub">修改代码/指令表编辑器的字体，可随时一键还原。</div>

  <div id="runbox"></div>

  <div class="card">
    <h2>当前状态</h2>
    <div id="state">读取中…</div>
    <div class="kv" id="hash"></div>
  </div>

  <div class="card">
    <h2>切换字体</h2>
    <label>选择已安装的字体（列表取自系统注册表，避免拼错导致 Windows 静默回退）</label>
    <div class="row">
      <div class="grow"><select id="fontsel"></select></div>
      <button class="primary" id="apply">应用</button>
    </div>
    <div class="hint">也可手动输入 exe 内置的字体名或其它名称：</div>
    <div class="row" style="margin-top:8px">
      <div class="grow"><input id="fontcustom" placeholder="例如 Cascadia Mono"></div>
      <button id="applycustom">应用自定义</button>
    </div>
  </div>

  <div class="card">
    <h2>还原</h2>
    <div class="row">
      <button class="danger" id="revert">还原为原始版本</button>
      <span class="hint" style="margin:0">从备份完整恢复 AutoShop.exe，空闲区里的字体名一并清除。</span>
    </div>
  </div>

  <div class="msg" id="msg"></div>

  <div class="foot">只监听 127.0.0.1 · 修改前会确认 AutoShop 已关闭</div>
</div>

<script>
const $ = (id) => document.getElementById(id);

function msg(text, kind) {
  const el = $('msg');
  el.style.display = 'block';
  el.className = 'msg ' + (kind || 'ok');
  el.textContent = text;
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  return await r.json();
}
const post = (path, body) => api(path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
});

function renderState(s) {
  if (!s.exists) {
    $('state').innerHTML = '<div class="status err">找不到 AutoShop.exe：' + (s.exe || '') + '</div>';
    return;
  }

  const n = s.running.processes.length;
  const unreadable = s.running.unreadablePath || 0;
  const rb = $('runbox');

  if (!s.running.supported) {
    rb.innerHTML = '<div class="status warn">⚠ 无法确认 AutoShop 是否在运行（' + (s.running.error || '检测失败') + '）。为防止改到运行中的文件，已禁止修改。<button id="refreshbtn" style="margin-left:auto;padding:5px 12px">刷新</button></div>';
    $('refreshbtn').onclick = () => refresh();
  } else if (n > 0) {
    const note = unreadable > 0 ? '（其中 ' + unreadable + ' 个路径不可读，通常因为以管理员权限运行）' : '';
    const action = unreadable > 0
      ? '<span class="hint" style="margin-left:auto">需手动关闭：提权进程普通权限无法结束</span>'
      : '<button id="killbtn" class="danger" style="margin-left:auto;padding:5px 12px">强制结束并应用</button>';
    rb.innerHTML = '<div class="status err">✕ AutoShop 正在运行（PID ' + s.running.processes.map(p => p.pid).join(', ') + '）' + note + ' —— 请先关闭软件，否则拒绝修改。' + action + '</div>';
    const kb = $('killbtn');
    if (kb) kb.onclick = async () => {
      kb.disabled = true; kb.textContent = '结束中…';
      const r = await post('/api/apply', { kill: true, font: $('fontsel').value });
      msg(r.ok ? '已结束 AutoShop 并应用字体：' + r.font : '失败：' + r.error, r.ok ? 'ok' : 'err');
      await refresh();
    };
  } else {
    rb.innerHTML = '<div class="status ok">✓ AutoShop 未运行，可以安全修改</div>';
  }
  const blocked = n > 0 || !s.running.supported;

  const targets = [...new Set(s.sites.map(x => x.target))];
  let badge, cls;
  if (!s.allSitesValid) { badge = '站点异常，请勿修改'; cls = 'err'; }
  else if (s.isOriginal === true) { badge = '原始版本（未打补丁）'; cls = 'warn'; }
  else if (s.patched) { badge = '已应用字体：' + (s.recordedFont || targets[0]); cls = 'ok'; }
  else { badge = '未知状态（哈希与记录不符）'; cls = 'warn'; }

  let html = '<div class="status ' + cls + '">' + badge + '</div>';
  if (!s.slotCheck.ok) {
    html += '<div class="status warn">⚠ 字体名落点无效：' + (s.slotCheck.reason || '') + ' —— 写入不会生效</div>';
  }
  html += '<table><tr><th>引用点</th><th>偏移</th><th>指向</th></tr>';
  for (const st of s.sites) {
    html += '<tr><td>' + st.key + '</td><td><code>' + st.off + '</code></td><td>' + st.target +
            (st.isOriginal ? ' <span style="color:#767e91">(原始)</span>' : '') + '</td></tr>';
  }
  html += '</table>';
  if (targets.length > 1) {
    html += '<div class="status warn" style="margin-top:12px">7 处引用点指向的字体不一致，可能被外部改动过。</div>';
  }
  $('state').innerHTML = html;

  let kv = '文件 ' + s.size + ' 字节  |  哈希 ' + s.hash.slice(0, 16) + '…';
  if (s.slotName) kv += '  |  空闲区内容 "' + s.slotName + '"';
  if (s.supportedVersion) kv += '  |  适配版本 AutoShop ' + s.supportedVersion;
  $('hash').textContent = kv;

  $('apply').disabled = blocked || !s.allSitesValid;
  $('applycustom').disabled = blocked || !s.allSitesValid;
  $('revert').disabled = !s.backupExists || blocked;
}

async function refresh() {
  const [s, f] = await Promise.all([api('/api/state'), api('/api/fonts')]);
  renderState(s);
  const sel = $('fontsel');
  const prev = sel.value;
  const fonts = (f.fonts && f.fonts.length) ? f.fonts : ['Consolas'];
  sel.innerHTML = fonts.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '" style="font-family:\'' + n.replace(/'/g, '') + '\'">' + n + '</option>').join('');
  if (prev && fonts.includes(prev)) sel.value = prev;
  return s;
}

$('apply').onclick = async () => {
  $('apply').disabled = true;
  const r = await post('/api/apply', { font: $('fontsel').value });
  msg(r.ok
    ? '已应用字体：' + r.font + '（改动 ' + r.changed.length + ' 处，文件大小 ' + r.size + ' 字节不变）\n启动 AutoShop 查看效果。'
    : '失败：' + r.error, r.ok ? 'ok' : 'err');
  await refresh();
};

$('applycustom').onclick = async () => {
  const name = $('fontcustom').value.trim();
  if (!name) { msg('请先输入字体名。', 'warn'); return; }
  $('applycustom').disabled = true;
  const r = await post('/api/apply', { font: name });
  msg(r.ok
    ? '已应用字体：' + r.font + (r.builtin ? '（exe 内置字符串）' : '（写入空闲区）') + '，改动 ' + r.changed.length + ' 处。'
    : '失败：' + r.error, r.ok ? 'ok' : 'err');
  await refresh();
};

$('revert').onclick = async () => {
  $('revert').disabled = true;
  const r = await post('/api/revert', {});
  if (r.ok) msg('已还原。' + (r.matchesOriginal ? '哈希与原始文件一致。' : '注意：哈希与原始记录不一致，请检查。'), r.matchesOriginal ? 'ok' : 'warn');
  else msg('失败：' + r.error, 'err');
  await refresh();
};

refresh();
setInterval(async () => { renderState(await api('/api/state')); }, 4000);
</script>
</body>
</html>
`;
