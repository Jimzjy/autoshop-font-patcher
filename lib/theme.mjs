/**
 * AutoShop 编辑器配色补丁 —— 暗色主题（VSCode Dark+ 风格）。
 *
 * ## 原理
 * 编辑器配色在配色初始化函数（文件偏移 0xEEECA4–0xEEF337，AutoShop V4.12.0.2）
 * 里以 `push <颜色立即数>` 的方式硬编码，随后经包装器调用 Scintilla 消息：
 *   - msg 2051 = SCI_STYLESETFORE（样式 1–31 的语法前景色）
 *   - msg 2052 = SCI_STYLESETBACK（样式 32 = STYLE_DEFAULT 的背景，即白底）
 *   - 另有光标色（0xEEECA3）与两处选区/行高亮浅色（0xEEF06D/0xEEF08F）
 *
 * 与字体补丁同一套路：只改写 push 后的 4 字节立即数，不增删任何字节。
 * Scintilla 颜色为 COLORREF 0x00BBGGRR 序（RGB(r,g,b) → r | g<<8 | b<<16）。
 * 主题表中的 hex 均为 #RRGGBB，写入前转换。
 */

export const rgb2colorref = (hex) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`颜色格式错误：${hex}（应为 #RRGGBB）`);
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  return (r | (g << 8) | (b << 16)) >>> 0;
};

/**
 * 配色站点表。off = push 指令的文件偏移；from = 原始立即数（写入前逐一核对）。
 * kind: fore=语法前景(样式号 style) / back=默认背景 / caret=光标 / highlight=选区·行高亮
 */
export const COLOR_SITES = [
  // 以下两处不是颜色：push 的 imm32 是 SCI_SETCODEPAGE(2037) 的代码页参数（0xFDE9=65001=SC_CP_UTF8）。
  // 误改会破坏中文等多字节字符（退格删半个字变「?」）。永远保持原始值，任何主题都不动。
  { key: "cp",        kind: "codepage",  off: 0x00eeeca3, from: 0x0000fde9, role: "代码页" },
  // 默认背景（样式 32，白底）
  { key: "back32",    kind: "back",      off: 0x00eeecc6, from: 0x00ffffff, style: 32, role: "编辑器背景" },
  // 语法前景色（样式 1–31，角色按旧颜色推测）
  { key: "fore01",    kind: "fore", off: 0x00eeed9b, from: 0x0000aa00, style: 0x01, role: "注释" },
  { key: "fore02",    kind: "fore", off: 0x00eeedaf, from: 0x0000aa00, style: 0x02, role: "注释" },
  { key: "fore03",    kind: "fore", off: 0x00eeedc3, from: 0x0000aa00, style: 0x03, role: "注释" },
  { key: "fore15",    kind: "fore", off: 0x00eeedd7, from: 0x0000aa00, style: 0x0f, role: "注释" },
  { key: "fore17",    kind: "fore", off: 0x00eeedeb, from: 0x0000aa00, style: 0x11, role: "注释" },
  { key: "fore18",    kind: "fore", off: 0x00eeedff, from: 0x0000aa00, style: 0x12, role: "注释" },
  { key: "fore04",    kind: "fore", off: 0x00eeee13, from: 0x00800080, style: 0x04, role: "数字" },
  { key: "fore06",    kind: "fore", off: 0x00eeee82, from: 0x00800080, style: 0x06, role: "数字" },
  { key: "fore05",    kind: "fore", off: 0x00eeee38, from: 0x00ee0000, style: 0x05, role: "关键字" },
  { key: "fore10",    kind: "fore", off: 0x00eeee96, from: 0x00ee0000, style: 0x0a, role: "关键字" },
  { key: "fore21",    kind: "fore", off: 0x00eeee4c, from: 0x0000a5ff, style: 0x15, role: "函数名" },
  { key: "fore07",    kind: "fore", off: 0x00eeeeaa, from: 0x000099ff, style: 0x07, role: "字符串" },
  { key: "fore11",    kind: "fore", off: 0x00eeeEbe, from: 0x006e1212, style: 0x0b, role: "变量/标识符" },
  { key: "fore23",    kind: "fore", off: 0x00eeeed2, from: 0x00ff901e, style: 0x17, role: "类型/特殊" },
  { key: "fore22",    kind: "fore", off: 0x00eeeee6, from: 0x00a03070, style: 0x16, role: "控制关键字" },
  { key: "fore26",    kind: "fore", off: 0x00eeeefa, from: 0x000073ff, style: 0x1a, role: "字符串变体" },
  { key: "fore27",    kind: "fore", off: 0x00eeef0e, from: 0x00323232, style: 0x1b, role: "行号/空白标记" },
  { key: "fore28",    kind: "fore", off: 0x00eeef22, from: 0x00323232, style: 0x1c, role: "行号/空白标记" },
  { key: "fore29",    kind: "fore", off: 0x00eeef36, from: 0x00b428be, style: 0x1d, role: "正则/特殊符号" },
  { key: "fore30",    kind: "fore", off: 0x00eeef4a, from: 0x00b428be, style: 0x1e, role: "正则/特殊符号" },
  { key: "fore31",    kind: "fore", off: 0x00eeef5e, from: 0x0032c832, style: 0x1f, role: "运算符/亮绿" },
  { key: "fore09",    kind: "fore", off: 0x00eeef72, from: 0x00000080, style: 0x09, role: "预处理/指令" },
  // 光标所在行背景（消息 2098 SETCARETLINEBACK，共 8 处）——主题下设为背景色使其不可见
  { key: "linebg1", kind: "highlight", off: 0x00eef06d, from: 0x00f0efd2, prevTo: 0x00784f26, role: "行高亮" },
  { key: "linebg2", kind: "highlight", off: 0x00eef08f, from: 0x00f0efd2, prevTo: 0x00784f26, role: "行高亮" },
  // 选区背景（CScintillaCtrl::SetSelBack 包装器 0x7D0920 的唯一调用点）
  { key: "sel1",    kind: "selection", off: 0x0038e55d, from: 0x008fff00, role: "选区" },

  // ===== 簇 B：0x11234xx（配色初始化第二份拷贝，与簇 A 同调色板）=====
  { key: "c2cp",      kind: "codepage", off: 0x011234cb, from: 0x0000fde9, role: "代码页" },
  { key: "c2back",    kind: "back",  off: 0x011234e8, from: 0x00ffffff, style: 32, role: "编辑器背景" },
  { key: "c2f01", kind: "fore", off: 0x0112353c, from: 0x0000aa00, style: 0x01, role: "注释" },
  { key: "c2f02", kind: "fore", off: 0x0112354d, from: 0x0000aa00, style: 0x02, role: "注释" },
  { key: "c2f03", kind: "fore", off: 0x0112355e, from: 0x0000aa00, style: 0x03, role: "注释" },
  { key: "c2f15", kind: "fore", off: 0x0112356f, from: 0x0000aa00, style: 0x0f, role: "注释" },
  { key: "c2f17", kind: "fore", off: 0x01123580, from: 0x0000aa00, style: 0x11, role: "注释" },
  { key: "c2f18", kind: "fore", off: 0x01123591, from: 0x0000aa00, style: 0x12, role: "注释" },
  { key: "c2f04", kind: "fore", off: 0x011235a2, from: 0x00800080, style: 0x04, role: "数字" },
  { key: "c2f05", kind: "fore", off: 0x011235c1, from: 0x00ee0000, style: 0x05, role: "关键字" },
  { key: "c2f21", kind: "fore", off: 0x011235d2, from: 0x0000a5ff, style: 0x15, role: "函数名" },
  { key: "c2f06", kind: "fore", off: 0x011235ff, from: 0x00800080, style: 0x06, role: "数字" },
  { key: "c2f10", kind: "fore", off: 0x01123610, from: 0x00ee0000, style: 0x0a, role: "关键字" },
  { key: "c2f07", kind: "fore", off: 0x01123621, from: 0x000099ff, style: 0x07, role: "字符串" },
  { key: "c2f11", kind: "fore", off: 0x0112364b, from: 0x006e1212, style: 0x0b, role: "变量/标识符" },
  { key: "c2f23", kind: "fore", off: 0x0112365c, from: 0x00ff901e, style: 0x17, role: "类型/特殊" },
  { key: "c2f22", kind: "fore", off: 0x0112366d, from: 0x00a03070, style: 0x16, role: "控制关键字" },
  { key: "c2f26", kind: "fore", off: 0x0112367e, from: 0x000073ff, style: 0x1a, role: "字符串变体" },
  { key: "c2f27", kind: "fore", off: 0x0112368f, from: 0x00323232, style: 0x1b, role: "行号/空白标记" },
  { key: "c2f28", kind: "fore", off: 0x011236a0, from: 0x00323232, style: 0x1c, role: "行号/空白标记" },
  { key: "c2f09", kind: "fore", off: 0x011236b1, from: 0x00000080, style: 0x09, role: "预处理/指令" },
  // 簇 B 的行高亮（同消息 2098）
  { key: "linebg3", kind: "highlight", off: 0x01123709, from: 0x00f0efd2, role: "行高亮" },
  { key: "linebg4", kind: "highlight", off: 0x0112372b, from: 0x00f0efd2, role: "行高亮" },

  // ===== 簇 C：0x114FAxx（第三份拷贝）+ 0x114Exx 语义加色 =====
  { key: "c3back",    kind: "back",  off: 0x0114fa86, from: 0x00ffffff, style: 32, role: "编辑器背景" },
  { key: "c3f01", kind: "fore", off: 0x0114faec, from: 0x0000aa00, style: 0x01, role: "注释" },
  { key: "c3f02", kind: "fore", off: 0x0114fb00, from: 0x0000aa00, style: 0x02, role: "注释" },
  { key: "c3f03", kind: "fore", off: 0x0114fb14, from: 0x0000aa00, style: 0x03, role: "注释" },
  { key: "c3f15", kind: "fore", off: 0x0114fb28, from: 0x0000aa00, style: 0x0f, role: "注释" },
  { key: "c3f17", kind: "fore", off: 0x0114fb3c, from: 0x0000aa00, style: 0x11, role: "注释" },
  { key: "c3f18", kind: "fore", off: 0x0114fb50, from: 0x0000aa00, style: 0x12, role: "注释" },
  { key: "c3f04", kind: "fore", off: 0x0114fb64, from: 0x00800080, style: 0x04, role: "数字" },
  { key: "c3f05", kind: "fore", off: 0x0114fb89, from: 0x00ee0000, style: 0x05, role: "关键字" },
  { key: "c3f21", kind: "fore", off: 0x0114fb9d, from: 0x0000a5ff, style: 0x15, role: "函数名" },
  { key: "c3f06", kind: "fore", off: 0x0114fbd3, from: 0x00800080, style: 0x06, role: "数字" },
  { key: "c3f10", kind: "fore", off: 0x0114fbe7, from: 0x00ee0000, style: 0x0a, role: "关键字" },
  { key: "c3f07", kind: "fore", off: 0x0114fbfb, from: 0x000099ff, style: 0x07, role: "字符串" },
  { key: "c3f11", kind: "fore", off: 0x0114fc0f, from: 0x006e1212, style: 0x0b, role: "变量/标识符" },
  { key: "c3f23", kind: "fore", off: 0x0114fc23, from: 0x00ff901e, style: 0x17, role: "类型/特殊" },
  { key: "c3f22", kind: "fore", off: 0x0114fc37, from: 0x00a03070, style: 0x16, role: "控制关键字" },
  { key: "c3f26", kind: "fore", off: 0x0114fc4b, from: 0x000073ff, style: 0x1a, role: "字符串变体" },
  { key: "c3f27", kind: "fore", off: 0x0114fc5f, from: 0x00323232, style: 0x1b, role: "行号/空白标记" },
  { key: "c3f28", kind: "fore", off: 0x0114fc73, from: 0x00323232, style: 0x1c, role: "行号/空白标记" },
  { key: "c3f09", kind: "fore", off: 0x0114fc87, from: 0x00000080, style: 0x09, role: "预处理/指令" },
  // 簇 C 的行高亮（同消息 2098）
  { key: "linebg5", kind: "highlight", off: 0x0114fd82, from: 0x00f0efd2, role: "行高亮" },
  { key: "linebg6", kind: "highlight", off: 0x0114fda4, from: 0x00f0efd2, role: "行高亮" },
  // 语义加色（函数调用/常量 TRUE/FALSE 等，编辑器初始化后追加设置）
  { key: "c3s24", kind: "fore", off: 0x0114eb9f, from: 0x002020b2, style: 0x18, role: "常量/TRUE" },
  { key: "c3s20", kind: "fore", off: 0x0114ecdf, from: 0x002020b2, style: 0x14, role: "函数调用" },
  { key: "c3s25", kind: "fore", off: 0x0114f03f, from: 0x002020b2, style: 0x19, role: "特殊符号2" },
  { key: "c3s05", kind: "fore", off: 0x0114f53f, from: 0x00ee0000, style: 0x05, role: "关键字" },
  { key: "c3s16", kind: "fore", off: 0x0114f69f, from: 0x00660033, style: 0x10, role: "控制关键字" },

  // ===== 簇 D：0xEFAExx 语义加色（另一份拷贝）=====
  { key: "c4s25", kind: "fore", off: 0x00efae46, from: 0x002020b2, style: 0x19, role: "特殊符号2" },
  { key: "c4s20", kind: "fore", off: 0x00efb0c6, from: 0x002020b2, style: 0x14, role: "函数调用" },
  { key: "c4s05", kind: "fore", off: 0x00efba86, from: 0x00ee0000, style: 0x05, role: "关键字" },
  { key: "c4s16", kind: "fore", off: 0x00efbc26, from: 0x00660033, style: 0x10, role: "控制关键字" },
  { key: "c4s24", kind: "fore", off: 0x00efbd76, from: 0x002020b2, style: 0x18, role: "常量/TRUE" },

  // ===== 簇 E：0x105EAxx（第四份拷贝，光标/背景 + 语义三色）=====
  { key: "c5cp",      kind: "codepage", off: 0x0105ea13, from: 0x0000fde9, role: "代码页" },
  { key: "c5back",    kind: "back",  off: 0x0105ea36, from: 0x00ffffff, style: 32, role: "编辑器背景" },
  { key: "c5s20", kind: "fore", off: 0x0105ea8d, from: 0x000000ff, style: 0x14, role: "函数调用" },
  { key: "c5s24", kind: "fore", off: 0x0105eaa1, from: 0x004cb122, style: 0x18, role: "常量/TRUE" },
  { key: "c5s25", kind: "fore", off: 0x0105eab5, from: 0x00ff0000, style: 0x19, role: "特殊符号2" },
  // 簇 E 的行高亮（同消息 2098）
  { key: "linebg7", kind: "highlight", off: 0x0105ec44, from: 0x00f0efd2, role: "行高亮" },
  { key: "linebg8", kind: "highlight", off: 0x0105ec66, from: 0x00f0efd2, role: "行高亮" },
];

/** 内置主题。original = 特殊主题：把所有配色站点还原为原始立即数。 */
export const THEMES = {
  original: {
    key: "original",
    label: "亮色（恢复原始配色）",
  },
  dark: {
    key: "dark",
    label: "暗色（VSCode Dark+ 风格）",
    colors: {
      caret: "#AEAFAD",
      back: "#1E1E1E",
      fore: {
        "注释": "#6A9955",
        "数字": "#B5CEA8",
        "关键字": "#569CD6",
        "函数名": "#DCDCAA",
        "字符串": "#CE9178",
        "变量/标识符": "#9CDCFE",
        "类型/特殊": "#4FC1FF",
        "控制关键字": "#C586C0",
        "字符串变体": "#CE9178",
        "行号/空白标记": "#858585",
        "正则/特殊符号": "#D16D9E",
        "运算符/亮绿": "#B5CEA8",
        "预处理/指令": "#D7BA7D",
        "函数调用": "#DCDCAA",
        "常量/TRUE": "#569CD6",
        "特殊符号2": "#C586C0",
        "行高亮": "#1E1E1E",
        "选区": "#264F78",
      },
      highlight: "#264F78",
    },
  },
  atomOneDark: {
    key: "atomOneDark",
    label: "Atom One Dark",
    colors: {
      caret: "#528BFF",
      back: "#282C34",
      fore: {
        "注释": "#5C6370",
        "数字": "#D19A66",
        "关键字": "#C678DD",
        "函数名": "#61AFEF",
        "字符串": "#98C379",
        "变量/标识符": "#E06C75",
        "类型/特殊": "#E5C07B",
        "控制关键字": "#C678DD",
        "字符串变体": "#98C379",
        "行号/空白标记": "#4B5263",
        "正则/特殊符号": "#56B6C2",
        "运算符/亮绿": "#56B6C2",
        "预处理/指令": "#D19A66",
        "函数调用": "#61AFEF",
        "常量/TRUE": "#D19A66",
        "特殊符号2": "#C678DD",
        "行高亮": "#2C313C",
        "选区": "#3E4451",
      },
      highlight: "#2C313C",
    },
  },
  githubDark: {
    key: "githubDark",
    label: "GitHub Dark",
    colors: {
      caret: "#C9D1D9",
      back: "#0D1117",
      fore: {
        "注释": "#8B949E",
        "数字": "#79C0FF",
        "关键字": "#FF7B72",
        "函数名": "#D2A8FF",
        "字符串": "#A5D6FF",
        "变量/标识符": "#FFA657",
        "类型/特殊": "#FFA657",
        "控制关键字": "#FF7B72",
        "字符串变体": "#A5D6FF",
        "行号/空白标记": "#6E7681",
        "正则/特殊符号": "#7EE787",
        "运算符/亮绿": "#FF7B72",
        "预处理/指令": "#FFA657",
        "函数调用": "#D2A8FF",
        "常量/TRUE": "#79C0FF",
        "特殊符号2": "#FF7B72",
        "行高亮": "#161B22",
        "选区": "#264F78",
      },
      highlight: "#161B22",
    },
  },
};

/** UI 用：角色展示顺序（背景/光标在 fore 之外，单独取）。 */
export const THEME_ROLES = [
  "背景",
  "注释", "关键字", "控制关键字", "数字", "常量/TRUE",
  "函数名", "函数调用", "字符串", "字符串变体",
  "变量/标识符", "类型/特殊", "预处理/指令",
  "正则/特殊符号", "特殊符号2", "运算符/亮绿",
  "行号/空白标记", "行高亮", "选区",
];

/** 取主题中某角色的颜色（背景/光标存在 fore 之外）。original 无色表，返回 null。 */
export function themeRoleColor(themeKey, role, customColors = null) {
  const c = resolveColors(themeKey, customColors);
  if (!c) return null;
  if (role === "背景") return c.back;
  if (role === "光标") return c.caret;
  return c.fore[role] ?? null;
}

/** 解析主题的色表：custom 用传入色表，original 返回 null，其余取 THEMES。 */
export function resolveColors(themeKey, customColors = null) {
  if (themeKey === "original") return null;
  if (themeKey === "custom") {
    if (!customColors || !customColors.fore) throw new Error("自定义主题需要提供 colors（含 back/caret/fore）");
    return customColors;
  }
  const t = THEMES[themeKey];
  if (!t) throw new Error(`未知主题：${themeKey}（可用：${Object.keys(THEMES).join(", ")}，custom）`);
  return t.colors;
}

/**
 * 解析主题：得到每个站点的目标 COLORREF。
 * original = 每个站点还原为自己的原始立即数；custom = 用传入色表逐站点取色。
 */
export function resolveTheme(themeKey, customColors = null) {
  if (themeKey === "original") {
    return COLOR_SITES.map((s) => ({ ...s, to: s.from }));
  }
  const colors = resolveColors(themeKey, customColors);
  return COLOR_SITES.map((s) => {
    let to;
    if (s.kind === "codepage") to = s.from; // 代码页永远不动
    else if (s.kind === "caret") to = rgb2colorref(colors.caret);
    else if (s.kind === "back") to = rgb2colorref(colors.back);
    else {
      // fore 及 highlight/selection 都按角色取色
      const hex = colors.fore[s.role];
      if (!hex) throw new Error(`主题 ${themeKey} 缺少角色「${s.role}」的颜色`);
      to = rgb2colorref(hex);
    }
    return { ...s, to };
  });
}

/** 逐站点校验当前字节，返回每个站点的状态（原始 / 已是目标色 / 不符）。
 * 允许的现值 = {原始, 目标, prevTo} ∪ 各内置主题对该站点的目标色 ∪ prevColors 主题的目标色
 * （prevColors 用于自定义→自定义的再次微调，或任意主题→自定义的迁移）。 */
export function preflightTheme(buf, themeKey, customColors = null, prevColors = null) {
  // 预计算：每个站点在各内置主题下的目标色，用于跨主题迁移
  const altTargets = new Map(); // `${off}` -> Set(colorref)
  const addTargets = (key, colors) => {
    for (const s of resolveTheme(key, colors)) {
      if (!altTargets.has(String(s.off))) altTargets.set(String(s.off), new Set());
      altTargets.get(String(s.off)).add(s.to);
    }
  };
  for (const k of Object.keys(THEMES)) addTargets(k, null);
  if (prevColors) addTargets("custom", prevColors);
  return resolveTheme(themeKey, customColors).map((s) => {
    const pushOk = buf[s.off] === 0x68;
    const cur = pushOk ? buf.readUInt32LE(s.off + 1) : null;
    const allowed = new Set([s.from, s.to, s.prevTo, ...(altTargets.get(String(s.off)) ?? [])]);
    return {
      key: s.key,
      off: s.off,
      kind: s.kind,
      style: s.style ?? null,
      role: s.role,
      pushOk,
      current: cur,
      from: s.from,
      to: s.to,
      isOriginal: cur === s.from,
      isTarget: cur === s.to,
      isPrev: cur === s.prevTo,
      ok: pushOk && allowed.has(cur),
    };
  });
}

/**
 * 在 buf 上就地应用主题色（buf 为拷贝时即构建补丁）。
 * 站点已处于目标色则跳过；既非原始也非目标色则报错（版本可能不符）。
 * @returns {string[]} 实际改动的站点 key
 */
export function applyThemeTo(buf, themeKey, customColors = null, prevColors = null) {
  const rows = preflightTheme(buf, themeKey, customColors, prevColors);
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    throw new Error("以下配色站点字节与已知版本不符，已中止：\n" +
      bad.map((r) => `  ${r.key}(${r.role}) @0x${r.off.toString(16)} 现值=0x${(r.current ?? 0).toString(16)}`).join("\n"));
  }
  const changed = [];
  for (const r of rows) {
    if (r.isTarget) continue;
    buf.writeUInt32LE(r.to, r.off + 1);
    changed.push(r.key);
  }
  return changed;
}
