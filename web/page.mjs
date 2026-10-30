/**
 * 界面页面的完整 HTML（含内联样式与脚本）。
 * 单文件、无外部依赖，由 bin/autoshop-font-ui.mjs 直接返回给浏览器。
 * Tab 结构：字体 / 配色 两个页签；配色页含主题预设、逐角色颜色编辑与实时预览。
 */
export const PAGE = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoShop 定制工具</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif; background:#12141a; color:#e6e8ee; }
  .wrap { max-width:980px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:#8b93a7; font-size:13px; margin-bottom:18px; }
  .tabs { display:flex; gap:6px; border-bottom:1px solid #262b38; margin-bottom:16px; }
  .tab { padding:9px 22px; cursor:pointer; color:#8b93a7; font-size:14px; border:1px solid transparent; border-bottom:none; border-radius:8px 8px 0 0; user-select:none; }
  .tab:hover { color:#e6e8ee; }
  .tab.active { background:#1a1d26; border-color:#262b38; color:#fff; font-weight:600; }
  .pane { display:none; }
  .pane.active { display:block; }
  .card { background:#1a1d26; border:1px solid #262b38; border-radius:10px; padding:18px 20px; margin-bottom:16px; }
  .card h2 { font-size:14px; margin:0 0 14px; color:#aab2c6; font-weight:600; letter-spacing:.4px; }
  .row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .grow { flex:1; min-width:240px; }
  label { color:#aab2c6; font-size:13px; display:block; margin-bottom:6px; }
  select, input[type=text] { width:100%; padding:9px 11px; background:#0f1116; color:#e6e8ee; border:1px solid #2c3243; border-radius:7px; font-size:14px; font-family:inherit; }
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
  /* 配色编辑器 */
  .colorgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:8px 18px; margin-top:10px; }
  .colorrow { display:flex; align-items:center; gap:9px; }
  .colorrow input[type=color] { width:38px; height:28px; padding:1px; border:1px solid #2c3243; border-radius:6px; background:#0f1116; cursor:pointer; flex:none; }
  .colorrow .cname { flex:1; font-size:13px; color:#c6cddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .colorrow .chex { font-size:11px; color:#767e91; font-family:Consolas,monospace; }
  .colorrow.dirty .cname::after { content:" *"; color:#e8cf8a; }
  .preview { margin-top:14px; border:1px solid #2c3243; border-radius:8px; padding:12px 14px; font:13px/1.9 Consolas,"JetBrains Mono",monospace; white-space:pre; overflow-x:auto; }
  .curs { display:inline-block; width:2px; height:15px; vertical-align:-2px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>AutoShop 定制工具</h1>
  <div class="sub">修改代码/指令表编辑器的字体与配色，可随时一键还原。</div>

  <div id="runbox"></div>

  <div class="tabs">
    <div class="tab active" data-tab="font">字体</div>
    <div class="tab" data-tab="theme">配色</div>
  </div>

  <div class="pane active" id="pane-font">
    <div class="card">
      <h2>切换字体</h2>
      <label>选择已安装的字体（列表取自系统注册表，避免拼错导致 Windows 静默回退）</label>
      <div class="row">
        <div class="grow"><select id="fontsel"></select></div>
        <button class="primary" id="apply">应用字体</button>
      </div>
      <div class="row" style="margin-top:8px">
        <div class="grow"><input type="text" id="fontcustom" placeholder="例如 Cascadia Mono"></div>
        <button id="applycustom">应用自定义字体</button>
      </div>
      <div class="hint">只改字体，不动配色。</div>
    </div>
  </div>

  <div class="pane" id="pane-theme">
    <div class="card">
      <h2>切换配色</h2>
      <div class="row">
        <div class="grow">
          <label>主题预设（代码高亮保留；选「亮色」恢复 AutoShop 原始配色）</label>
          <select id="themesel"></select>
        </div>
        <button class="primary" id="applytheme" style="align-self:flex-end">应用配色</button>
      </div>
      <div class="hint">下方每个部分的颜色都可以单独修改；改动任意颜色后预设自动变为「自定义」。只改配色，不动字体。</div>
      <div class="colorgrid" id="colorgrid"></div>
      <div class="preview" id="preview"></div>
    </div>
  </div>

  <div class="card">
    <h2>当前状态</h2>
    <div id="state">读取中…</div>
    <div class="kv" id="hash"></div>
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

/* ---------- Tab 切换 ---------- */
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('pane-' + t.dataset.tab).classList.add('active');
  };
});

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

/* ---------- 配色编辑器状态 ---------- */
let THEMES = [];          // [{key,label,colors}]
let ROLES = [];           // 展示顺序
let curColors = {};       // role -> '#rrggbb'（背景/光标也在内）
let presetDirty = false;  // 用户是否手动改过颜色
let serverCustom = null;  // 服务器记录的 customColors（patch.json）

function getColors(key) {
  const t = THEMES.find(x => x.key === key);
  return t ? t.colors : null;
}
function roleColor(colors, role) {
  if (!colors) return null;
  if (role === '背景') return colors.back;
  if (role === '光标') return colors.caret;
  return colors.fore[role] || null;
}
function buildColorsObject() {
  const fore = {};
  for (const r of ROLES) {
    if (r === '背景' || r === '光标') continue;
    fore[r] = curColors[r];
  }
  return { caret: curColors['光标'], back: curColors['背景'], fore: fore };
}

function renderColorGrid(disabled) {
  $('colorgrid').innerHTML = ROLES.map(r =>
    '<div class="colorrow" data-role="' + r + '">' +
      '<input type="color" id="c_' + r + '" value="' + (curColors[r] || '#000000') + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="cname">' + r + '</span>' +
      '<span class="chex" id="x_' + r + '">' + (curColors[r] || '') + '</span>' +
    '</div>').join('');
  ROLES.forEach(r => {
    const inp = $('c_' + r);
    if (!inp) return;
    inp.oninput = () => {
      if (presetDirty === false) {
        // 第一次手动改动：预设下拉切到「自定义」
        presetDirty = true;
        ensureCustomOption();
        $('themesel').value = 'custom';
      }
      curColors[r] = inp.value;
      $('x_' + r).textContent = inp.value;
      inp.closest('.colorrow').classList.add('dirty');
      renderPreview();
    };
  });
}

function ensureCustomOption() {
  const sel = $('themesel');
  if (![...sel.options].some(o => o.value === 'custom')) {
    const o = document.createElement('option');
    o.value = 'custom'; o.textContent = '自定义（当前编辑）';
    sel.appendChild(o);
  }
}

function loadPreset(key) {
  if (key === 'custom') {
    // 自定义：色表可编辑，沿用当前编辑值；为空则用服务器记录或 dark 预设打底
    if (!Object.keys(curColors).length) {
      const src = serverCustom || getColors('dark');
      for (const r of ROLES) curColors[r] = roleColor(src, r) || '#000000';
    }
    presetDirty = true;
    renderColorGrid(false);
    renderPreview();
    return;
  }
  const colors = getColors(key);
  presetDirty = false;
  if (!colors) { // 亮色（恢复原始）：颜色不可编辑
    renderColorGrid(true);
    renderPreview();
    return;
  }
  for (const r of ROLES) curColors[r] = roleColor(colors, r) || curColors[r] || '#000000';
  renderColorGrid(false);
  renderPreview();
}

function renderPreview() {
  const bg = curColors['背景'] || '#1E1E1E';
  const caret = curColors['光标'] || '#AEAFAD';
  const sel = curColors['选区'] || '#264F78';
  const c = r => curColors[r] || '#cccccc';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const span = (role, txt) => '<span style="color:' + c(role) + '">' + esc(txt) + '</span>';
  const html =
    span('注释', '(* 速度给定，单位 mm/s *)') + '\n' +
    span('变量/标识符', 'fSpeed') + ' ' + span('运算符/亮绿', ':= ') +
    span('数字', '500') + ' ' + span('运算符/亮绿', '+ ') + span('变量/标识符', 'fOffset') +
    span('运算符/亮绿', ' * ') + span('数字', '0.5') + span('特殊符号2', ';') + '\n' +
    span('控制关键字', 'IF') + ' ' + span('变量/标识符', 'bEnable') + ' ' +
    span('控制关键字', 'AND NOT') + ' ' + span('变量/标识符', 'bError') + ' ' +
    span('控制关键字', 'THEN') + '\n' +
    '  ' + span('变量/标识符', 'bResult') + ' ' + span('运算符/亮绿', ':= ') +
    span('函数调用', 'SC_SetReady') + span('特殊符号2', '(') +
    span('常量/TRUE', 'TRUE') + span('特殊符号2', ',') + ' ' +
    span('字符串', "'start'") + span('特殊符号2', ')') + span('特殊符号2', ';') + '\n' +
    span('关键字', 'END_IF') + span('特殊符号2', ';') +
    '<span class="curs" style="background:' + caret + '"></span>';
  const pv = $('preview');
  pv.style.background = bg;
  pv.innerHTML = '<span style="background:' + sel + '">&nbsp;</span>' + html;
}

function renderThemeSelect(selected) {
  const sel = $('themesel');
  sel.innerHTML = THEMES.map(t => '<option value="' + t.key + '">' + t.label + '</option>').join('');
  if (selected) { ensureCustomOption(); sel.value = selected; }
  loadPreset(sel.value);
}
$('themesel').onchange = () => loadPreset($('themesel').value);

/* ---------- 状态渲染 ---------- */
function renderState(s) {
  if (!s.exists) {
    $('state').innerHTML = '<div class="status err">找不到 AutoShop.exe：' + (s.exe || '') + '</div>';
    return;
  }

  const n = s.running.processes.length;
  const unreadable = s.running.unreadablePath || 0;
  const rb = $('runbox');
  let blockedByRun = false;

  if (!s.running.supported) {
    rb.innerHTML = '<div class="status warn">⚠ 无法确认 AutoShop 是否在运行（' + (s.running.error || '检测失败') + '）。为防止改到运行中的文件，已禁止修改。<button id="refreshbtn" style="margin-left:auto;padding:5px 12px">刷新</button></div>';
    $('refreshbtn').onclick = () => refresh();
  } else if (n > 0) {
    blockedByRun = true;
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
  const blocked = blockedByRun || !s.running.supported;

  const targets = [...new Set(s.sites.map(x => x.target))];
  let badge, cls;
  if (!s.allSitesValid) { badge = '站点异常，请勿修改'; cls = 'err'; }
  else if (s.isOriginal === true) { badge = '原始版本（未打补丁）'; cls = 'warn'; }
  else if (s.patched) {
    const themeTxt = s.recordedTheme === 'original' ? '原始配色' : (s.recordedTheme === 'custom' ? '自定义主题' : (s.recordedTheme ? '主题 ' + s.recordedTheme : ''));
    badge = '已应用字体：' + (s.recordedFont || targets[0]) + (themeTxt ? ' · ' + themeTxt : '') + (s.recordedTheme ? '' : ' · 原始配色'); cls = 'ok';
  }
  else { badge = '未知状态（哈希与记录不符）'; cls = 'warn'; }

  let html = '<div class="status ' + cls + '">' + badge + '</div>';
  if (!s.slotCheck.ok) {
    html += '<div class="status warn">⚠ 字体名落点无效：' + (s.slotCheck.reason || '') + ' —— 写入不会生效</div>';
  }
  if (!s.allSitesValid) {
    html += '<div class="status err">站点校验异常，已禁止修改，请运行 selftest 排查。</div>';
  }
  const ff = s.dll && s.dll.flashfix;
  if (ff && s.recordedTheme && s.recordedTheme !== 'original') {
    html += ff.embedded
      ? '<div class="status ok">切窗闪白修复已启用（flashfix.dll）</div>'
      : '<div class="status warn">切窗闪白修复未启用，重新应用一次暗色主题即可</div>';
  }
  $('state').innerHTML = html;

  let kv = '文件 ' + s.size + ' 字节  |  哈希 ' + s.hash.slice(0, 16) + '…';
  if (s.slotName) kv += '  |  空闲区内容 "' + s.slotName + '"';
  if (s.supportedVersion) kv += '  |  适配版本 AutoShop ' + s.supportedVersion;
  $('hash').textContent = kv;

  $('apply').disabled = blocked || !s.allSitesValid;
  $('applycustom').disabled = blocked || !s.allSitesValid;
  $('applytheme').disabled = blocked;
  $('revert').disabled = !s.backupExists || blocked;
}

async function refresh() {
  const [s, f, t] = await Promise.all([api('/api/state'), api('/api/fonts'), api('/api/themes')]);
  renderState(s);
  const sel = $('fontsel');
  const prev = sel.value;
  const fonts = (f.fonts && f.fonts.length) ? f.fonts : ['Consolas'];
  sel.innerHTML = fonts.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '" style="font-family:\'' + n.replace(/'/g, '') + '\'">' + n + '</option>').join('');
  if (prev && fonts.includes(prev)) sel.value = prev;

  THEMES = t.themes || [];
  ROLES = t.roles || [];
  serverCustom = s.recordedCustomColors || null;
  if (!Object.keys(curColors).length) {
    // 首次：用服务器记录的当前主题初始化色表
    if (s.recordedTheme === 'custom' && s.recordedCustomColors) {
      for (const r of ROLES) curColors[r] = roleColor(s.recordedCustomColors, r) || '#000000';
      renderColorGrid(false);
      renderPreview();
      renderThemeSelect('custom');
      presetDirty = true;
    } else {
      renderThemeSelect(s.recordedTheme && s.recordedTheme !== 'original' ? s.recordedTheme : null);
      if (s.recordedTheme === 'original') { $('themesel').value = 'original'; loadPreset('original'); }
    }
  }
  return s;
}

/* ---------- 操作 ---------- */
$('apply').onclick = async () => {
  $('apply').disabled = true;
  $('applycustom').disabled = true;
  const r = await post('/api/apply', { font: $('fontsel').value });
  msg(r.ok
    ? (r.fontChanged
        ? '已应用字体：' + r.font + '（改动 ' + r.changed.length + ' 处，文件大小 ' + r.size + ' 字节不变）\n启动 AutoShop 查看效果。'
        : '字体已是 ' + r.font + '，无需改动。')
    : '失败：' + r.error, r.ok ? 'ok' : 'err');
  await refresh();
};

$('applycustom').onclick = async () => {
  const name = $('fontcustom').value.trim();
  if (!name) { msg('请先输入字体名。', 'warn'); return; }
  $('apply').disabled = true;
  $('applycustom').disabled = true;
  const r = await post('/api/apply', { font: name });
  msg(r.ok
    ? (r.fontChanged
        ? '已应用字体：' + r.font + (r.builtin ? '（exe 内置字符串）' : '（写入空闲区）') + '，改动 ' + r.changed.length + ' 处。'
        : '字体已是 ' + r.font + '，无需改动。')
    : '失败：' + r.error, r.ok ? 'ok' : 'err');
  await refresh();
};

$('applytheme').onclick = async () => {
  $('applytheme').disabled = true;
  const key = $('themesel').value;
  const body = { theme: key };
  if (key === 'custom') {
    const missing = ROLES.filter(r => r !== '背景' && r !== '光标' && !curColors[r]);
    if (missing.length) { msg('自定义主题缺少颜色：' + missing.join('、'), 'err'); $('applytheme').disabled = false; return; }
    body.colors = buildColorsObject();
  }
  const r = await post('/api/apply', body);
  msg(r.ok
    ? (r.themeChanged.length
        ? '已应用配色：' + (key === 'original' ? '原始配色' : key === 'custom' ? '自定义主题' : key) + '（改动 ' + r.themeChanged.length + ' 处）\n启动 AutoShop 查看效果。'
        : '配色已是当前选择，无需改动。')
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
