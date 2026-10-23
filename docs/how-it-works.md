# 技术细节

补丁原理、站点定位方法，以及 AutoShop 升级后的重新适配步骤。涵盖字体、配色主题、`SciLexer.dll` 视图默认值与切窗闪白修复。

## 1. 目标程序特征

| 项目 | 值 |
|---|---|
| 软件 | AutoShop **V4.12.0.2**（发布者 Inovance Technology Co., Ltd）|
| 文件 | `C:\Inovance Control\AutoShop\AutoShop.exe` |
| 格式 | PE32（32 位）|
| 大小 | 55,592,960 字节 |
| 映像基址 | `0x400000` |
| 重定位表 | **无**（`reloc` 目录大小为 0，加载地址固定）|
| UI 框架 | MFC + DuiLib |
| 编辑器 | **Scintilla**（`SciLexer.dll`，封装类 `CScintillaCtrl` / `CProjScintillaCtrl`）|

本文档中的全部地址与偏移均以 **V4.12.0.2** 为准；版本不同则按 [§4](#4-如何重新定位) 重新定位。

重定位表为空，因此所有硬编码地址在运行时都有效，可以按绝对地址定位。

### 段表

| 段 | VirtAddr | VirtSize | RawPtr | RawSize | 权限 |
|---|---|---|---|---|---|
| `.text` | `0x00001000` | `0x01aaeb1c` | `0x00000400` | `0x01aaec00` | CODE\|EXEC\|READ |
| `.rdata` | `0x01ab0000` | `0x0040c271` | `0x01aaf000` | `0x0040c400` | READ |
| `.data` | `0x01ebd000` | `0x00187a14` | `0x01ebb400` | `0x0012ee00` | READ\|WRITE |
| `Shared` | `0x02045000` | `0x00000004` | `0x01fea200` | `0x00000200` | READ\|WRITE |
| `.rsrc` | `0x02046000` | `0x0151a288` | `0x01fea400` | `0x0151a400` | READ |

---

## 2. 补丁点

### 2.1 字体初始化站点

字体是编译期常量，初始化代码用 `push imm32` 把字体名字符串地址压栈：

```asm
push 1                       ; 参数
push <字体名地址>             ; ← 改写这 4 个字节
push 0x20                    ; 0x20 = Scintilla 的 STYLE_DEFAULT
mov  ecx, [ebp-0x60]
mov  ecx, [ecx+0x58]
call 0xBD12A0
```

`call 0xBD12A0` 内部：

```asm
cmp  dword [ebp+0x10], 0
je   short L2
L1:
  push [ebp+0x0c]            ; 字体名
  push [ebp+0x08]            ; style id
  push 0x802                 ; 2050 = SCI_STYLESETFONT  ← 设置字体名
  mov  edx, [ebp-4]
  mov  edx, [edx+0x54]       ; Scintilla 接口虚函数表
  call dword [edx]
L2:
  push 0
  push 0                     ; 字符集
  push [ebp+0x08]
  push 0x812                 ; 2066 = SCI_STYLESETCHARACTERSET
  ... call dword [edx]
```

### 2.2 站点表

`off` 为 push 指令的文件偏移，`from` 为它原本压入的字符串地址。

| 站点 | 文件偏移 | 原字符串地址 | 原字体 |
|---|---|---|---|
| site1 | `0x00EEED1D` | `0x1FE11F0` | Consolas |
| site2 | `0x00EEECEB` | `0x1FE11FC` | Lucida Sans Typewriter |
| site3 | `0x0105EA5B` | `0x1FE11FC` | Lucida Sans Typewriter |
| site4 | `0x01123507` | `0x1FE11FC` | Lucida Sans Typewriter |
| site5 | `0x0114FAAB` | `0x1FE11FC` | Lucida Sans Typewriter |
| site6 | `0x0038E4FE` | `0x1F13894` | Microsoft YaHei（条件分支）|
| site7 | `0x0057DB95` | `0x1F13894` | Microsoft YaHei（条件分支）|

每处均为 `push imm32`：字节形如 `68 <addr 小端 4 字节>`。校验方法见 [§4](#4-如何重新定位)。

### 2.3 exe 中已有的字体名字符串

| 字体名 | 文件偏移 | 绝对虚拟地址 | 可用空间 |
|---|---|---|---|
| `Consolas` | `0x1BE01F0` | `0x1FE11F0` | 11 字节 |
| `Lucida Sans Typewriter` | `0x1BE01FC` | `0x1FE11FC` | 447 字节 |
| `Lucida Sans Unicode` | `0x1BE03BC` | `0x1FE13BC` | 39 字节 |

这些字符串可正常引用，因此改用它们不需要写入任何新字节。

### 2.4 可写空闲区

写入 exe 中不存在的字体名时使用：

| 项 | 值 |
|---|---|
| 文件偏移 | `0x1B2C7A9` |
| 绝对虚拟地址 | `0x1F2D7A9` |
| 所属段 | `.rdata` |
| 容量 | 60 字节（字体名最长 59 字符 + 结尾 `\0`）|
| 选取条件 | ① 全 exe 无任何取址指令引用 ② 段内偏移 `0x7D7A9 < VirtSize` ③ 前后相邻数据不被覆盖 |

---

## 3. 地址与落点的硬性要求

以下两条是写入生效的前提，工具的落点体检（`lib/patch.mjs` 的 `checkSlot`）会强制校验，不满足即拒绝写入。

### 3.1 地址必须经段表换算

文件偏移不是 RVA，换算必须使用：

```
VA = 段.VirtAddr + (文件偏移 - 段.RawPtr) + ImageBase
```

不能简化为 `文件偏移 + ImageBase`。`lib/pe.mjs` 的 `offsetToAbs()` 实现了这一换算，`scripts/selftest.mjs` 会用三个已知字体名的偏移与地址对照做交叉验证。

### 3.2 虚拟地址必须落在 `VirtSize` 之内

PE 加载器只映射每个段的前 `VirtSize` 个字节；段的 `RawSize` 通常大于 `VirtSize`，超出的部分**只存在于文件、不会被加载进内存**。

因此可写区域的选取条件不只是"文件里是空白"，还必须满足段内偏移 `< VirtSize`。落在映射范围之外的写入，文件内容会改变但程序读取不到，表现为补丁"已应用"却毫无效果。

`isLoadable()` 实现该校验：

```js
export function isLoadable(pe, off) {
  const s = sectionAt(pe, off);
  return Boolean(s) && off - s.rptr < s.vsize;
}
```

### 3.3 写入不得覆盖相邻数据

空闲区前后紧邻其它数据（字符串、结构等），写入长度必须受 `SLOT.capacity` 约束，且落点区间只允许包含目标字体名与结尾 `\0`。工具在写入前会以 `capacity` 为单位清零该区间，不触及区间之外。

---

## 4. 如何重新定位

AutoShop 升级后偏移会变，按以下步骤重新定位。

### 4.1 找字体初始化站点

1. 在 exe 的 `.rdata` 中搜索字体名字符串（ASCII），记下其**绝对虚拟地址**。
2. 在 `.text` 段内搜索该地址的 `push imm32` 编码：`68 <地址小端 4 字节>`。
3. 对每个命中位置，检查其后 80 字节内是否存在 `call` 到同一个函数，且该函数内部能同时看到 `2050`（`SCI_STYLESETFONT`）与 `2066`（`SCI_STYLESETCHARACTERSET`）。只有满足这一条件的才是字体初始化站点。

第 3 步是必要筛选：单纯搜索地址会在数据区产生大量误报。

### 4.2 找新的可写空闲区

1. 在 `.rdata` 中找长度 ≥ 60 的连续零区。
2. 排除段内偏移 ≥ `VirtSize` 的（见 [§3.2](#32-虚拟地址必须落在-virtsize-之内)）。
3. 排除被任何取址指令引用的：搜索 `push imm32` / `mov r32,imm32` / `lea r32,[abs]` 等编码。
4. 确认区间前后相邻数据不被覆盖。
5. 修改 `lib/patch.mjs` 中的 `SLOT` 与 `SITES`，然后运行 `node scripts/selftest.mjs`。

自检脚本会用已知字体名交叉验证地址换算结果，站点字节不符会直接报错。

---

## 5. 运行检测规则

AutoShop 常以**管理员权限**启动，此时普通权限调用 `Get-Process` 读不到该进程的 `Path` 属性（返回空）。若仅以"路径匹配"判定运行状态，这类进程会被判为未运行，从而在软件运行中改写 exe。因此检测按以下流程执行，并在无法确认身份时**按"运行中"处理并拒绝修改**：

1. 按**进程名**筛出候选（`Get-Process -Name AutoShop`）
2. 读取可执行文件路径；读不到则降级查 `Win32_Process` 的 `ExecutablePath`
3. 连 `ExecutablePath` 也读不到时，取进程**基名**精确比对 `AutoShop.exe`，避免误伤 `AutoShopFoo.exe` 之类
4. 仍无法确认身份 → 判定为运行中

普通权限无法结束提权进程（`Stop-Process`、`taskkill /F` 均被拒），因此界面对这类进程不提供"强制结束"，而是提示手动关闭。

---

## 6. 配色主题（lib/theme.mjs）

编辑器配色与字体一样是编译期硬编码。配色初始化函数位于文件偏移 `0xEEECA4`–`0xEEF337`，形态为 `push <颜色立即数>; push <样式号>; call 包装器`，包装器分别发出：

- msg **2051** = `SCI_STYLESETFORE`（样式 1–31 语法前景色，入口 `0x7D04F6` 一带）
- msg **2052** = `SCI_STYLESETBACK`（样式 32 = STYLE_DEFAULT 的背景，站点 `0xEEECC6`）
- msg **2098** = `SCI_SETCARETLINEBACK`（光标行背景，直发，站点 `0xEEF06D`、`0xEEF08F` 等）

**多站点**：配色初始化代码在 exe 里有多份拷贝（不同编辑器/分支各一套），完整可用站点表共 **89 处**，见 `lib/theme.mjs` 的 `COLOR_SITES`：簇 A `0xEEECA4` 一带、簇 B `0x11234xx`、簇 C `0x114FAxx`、簇 D `0xEFAExx`、簇 E `0x105EAxx`，外加行高亮 8 处与选区 1 处。

每个站点带以下字段：

| 字段 | 含义 |
|---|---|
| `off` | 立即数的文件偏移 |
| `from` | 原始立即数（COLORREF），用于预检与还原 |
| `kind` | `fore` / `back` / `highlight` / `selection` / `codepage` |
| `role` | 主题角色名（注释、关键字、函数调用……），`fore` / `highlight` / `selection` 站点按它查色 |

取色规则（`resolveTheme()`）：

- `fore` / `highlight` / `selection` 站点 → `colors.fore[role]`
- `back` → `colors.back`
- `codepage` → **永远保持原值**。这类站点的立即数是 `0xFDE9`（65001 = UTF-8 代码页），不随任何主题变化。
- 编辑器光标不在 exe 站点表内，由 `SciLexer.dll` 的 `dll-caret` 站点负责（见 [§6.2](#62-scilexerdll-侧libscilexermjs)）。

### 6.1 主题模型与预设

`THEMES` 提供三个内置深色预设，`original` 表示逐站点写回原始立即数：

| 预设 | 背景 | 关键字 | 注释 | 字符串 |
|---|---|---|---|---|
| `dark`（VSCode Dark+） | `#1E1E1E` | `#569CD6` | `#6A9955` | `#CE9178` |
| `atomOneDark` | `#282C34` | `#C678DD` | `#5C6370` | `#98C379` |
| `githubDark` | `#0D1117` | `#FF7B72` | `#8B949E` | `#A5D6FF` |

每个预设是一张完整色表：`back`（背景）+ `fore` 的 18 个角色（含行高亮与选区），界面正好显示为 19 个可编辑部分。界面里的逐部分调色就是直接改这张表，改完走同一条 `resolveTheme()` 路径写入，不需要额外机制。（色表里还保留 `caret` 字段，供 `kind: caret` 的 exe 站点使用；当前这版 AutoShop 的光标不在 exe 站点表内，见 §6.2。）

`custom` 主题由界面传入色表，随 `AutoShop.exe.patch.json` 的 `customColors` 字段持久化，因此可以反复微调（命令行没有传色表的入口，`--theme custom` 会被拒绝）。`preflightTheme()` 允许的现值集合 = 各站点原始值 ∪ 各站点在所有内置主题下的目标色 ∪ 上次自定义色表的目标色，所以可以在任意预设与自定义之间自由切换，不会因为"现值不认识"被拒绝。

主题状态记录在 `AutoShop.exe.patch.json` 的 `theme`、`customColors` 与 `themeAppliedSites` 字段；`revert` 从备份整文件还原，不受主题记录影响。

### 6.2 SciLexer.dll 侧（lib/scilexer.mjs）

有三类颜色不在 exe 的消息站点里，而是 Scintilla 视图控件构造期的默认值，必须直接改 `SciLexer.dll`（共 9 处，均为**文件偏移**，DLL ImageBase `0x10000000`，`.text` VA = 文件偏移 + `0xC00`）：

| 站点 | 偏移 | 含义 |
|---|---|---|
| `dll-caret` | `0x52026` | `6A 00`→`6A FF`：CreateCaret 位图 memset 填充值 0→0xFF，黑光标变白 |
| `dll-sel1/2/3` | `0x54B2F`、`0x54B4F`、`0x54BC5` | ViewStyle 构造的选区默认色 `#C0C0C0`/`#B0B0B0` → 主题选区色 |
| `dll-styleback1–5` | `0x54A54`、`0x54025`、`0x5406D`、`0x54B6B`、`0x54BF7` | Style/ViewStyle 默认白底 → 主题背景色 |

为什么落在 DLL：编辑器的光标是 Scintilla 自己用 `CreateCaret` 建的 **Win32 系统 caret**（1bpp 全零位图 = 黑色），Scintilla 的 `SCI_SETCARETFORE` 消息对它不起作用；选区遮罩与空白区底色则由 `ViewStyle` 构造期的默认值决定。exe 侧 `0x7D0920` 的 `SetSelBack` 包装器虽然存在调用点，但不参与实际显示，故这两类颜色只做 DLL 站点。`SetSelFore` 没有调用点，选中文字保留各自的语法色。

这些站点按 `kind` 与 `role` 与主题联动：暗色主题写入主题选区色与背景色，切回亮色时写回原始值，`revert` 从 `SciLexer.dll.bak` 整文件恢复。

### 6.3 切窗闪白修复（lib/flashfix.mjs）

**现象**：切窗口（Alt-Tab 返回、页签切换）时编辑器闪一帧白。

**成因**：编辑器的父窗口类是 MFC 视图类 `AfxFrameOrView90u`，它的背景刷是系统预定义的白色画刷（`COLOR_WINDOW`）。窗口重绘时父窗口先擦背景、Scintilla 再覆盖，中间这一帧就是白闪。

**方案**：`assets/flashfix.dll`（源码 `build/flashfix/flashfix.c`，TDM-GCC `-m32 -shared` 编译）在进程内起线程，每 500ms 枚举类名为 `Scintilla` 的窗口，把其父窗口的 `GCL_HBRBACKGROUND` 换成用 `flashfix.ini` 中颜色创建的画刷。

**加载方式**：给 `SciLexer.dll` 追加一个 `.ffix` 节（VA `0x7C000`，文件尾 +512 字节），把导入目录改成"原有 5 个描述符 + `flashfix.dll!FlashFixInit` + 终止项"。系统加载器加载 `SciLexer.dll` 时会一并拉起修复 DLL，不需要额外注入器或常驻进程。

**还原**：`.ffix` 节里保存了原始导入目录 RVA/大小、节数、SizeOfImage 与文件大小，`stripFlashfix()` 据此还原，结果与原始文件逐字节一致。`--theme original` 或 `revert` 都会摘掉该节，此后 `flashfix.dll` 不再被加载；部署在 AutoShop 目录里的 `flashfix.dll` / `flashfix.ini` 会保留（不参与加载，重新应用深色主题时直接复用），需要清理时手动删除即可。

**启用条件**：`flashfixWanted()` 按主题背景亮度判断（亮度 < 128 的深色主题启用，`original` 不启用）。刷子颜色每次应用主题时写入 `flashfix.ini`，与编辑器底色一致。

离线验证：`node scripts/test-flashfix-embed.mjs`（注入 / 幂等 / 还原往返 + 真实 `LoadLibrary` 验证 flashfix.dll 被拉起）。

### 6.4 重新定位配色站点

AutoShop 升级后按以下步骤重建 `COLOR_SITES`：

1. 定位配色初始化函数：在 `.text` 中找"连续 `push imm32` 颜色 + `push <样式号>` + `call <包装器>`"的密集模式（簇 A 一带）。
2. 从包装器内部反查发出的消息号：`0x802`(2050)、`0x803`(2051)、`0x804`(2052)、`0x812`(2066)、`0x832`(2098)。这版 SciLexer 的消息号是定制的，与标准 Scintilla 编号不同。
3. 全 exe 搜索对所有 FORE/SETBACK 包装器的 `call`（`E8`）调用点，向前取 `push imm32` 的颜色与 `push imm8` 的样式号，按簇归入站点表。
4. 每个站点补上 `kind` 与 `role`：颜色与样式号决定它是前景、背景、行高亮还是选区；代码页站点（`0xFDE9`）标为 `codepage`。
5. 改 `COLOR_SITES` 后运行 `node scripts/selftest.mjs`，它会逐站点核对原始立即数。

颜色序为 **COLORREF `0x00BBGGRR`**（RGB(r,g,b) → `r | g<<8 | b<<16`），主题表里写 `#RRGGBB`，由 `rgb2colorref()` 转换。

---

## 7. 验证记录

**测试版本：AutoShop V4.12.0.2**

| 项 | 结果 |
|---|---|
| CLI 状态 / 自检 | 49 项通过（2026-10-23，含字体站点、89 处配色站点、9 处 DLL 站点与 flashfix 注入往返）|
| 端到端（界面接口 + 应用 + 还原）| 24 项通过，1 项跳过 |
| 还原闭环 | 打补丁 → 还原 → exe 哈希与原始逐字节一致、DLL 摘节后与原始逐字节一致 → 重新打补丁 → 哈希与首次一致 |
| exe 与原始差异 | 7 处字体 `push` 立即数（10 字节）+ 空闲区字体名（21 字节）+ 89 处配色立即数 |
| SciLexer.dll 与原始差异 | 头字段（节数、导入目录、节头、Characteristics）+ 9 处站点立即数 + 文件尾 `.ffix` 节（512 字节）|
| exe 文件大小 | 补丁前后完全一致，未增删字节 |
| SciLexer.dll 大小 | `478,720` → `479,232` 字节（仅 `.ffix` 节）；还原后回到 `478,720` |
| 内置预设 | `dark`、`atomOneDark`、`githubDark` 与 `custom` 均通过构建校验；自定义主题往返构建一致 |
| 已应用状态 | 字体 JetBrains Mono Medium + 主题 `dark`，89 处配色与 9 处 DLL 站点全部写入，闪白修复已启用 |
| 主题切换 | 暗色 ↔ 亮色往返后两文件均能回到原始字节，配色与选区、光标、默认底色随之还原 |
| 提权进程拦截 | 正确识别并拒绝修改 |
| 端口占用 | 自动顺延到下一个可用端口 |

字体的最终显示效果、闪烁与光标观感需在 AutoShop 中人工确认（原生 GUI，无法自动化验证）。
