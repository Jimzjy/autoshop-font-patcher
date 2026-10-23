# AutoShop 编辑器字体与配色工具

修改汇川 **AutoShop**（PLC 编程软件）代码/指令表编辑器的**字体**和**配色**。

AutoShop 没有提供修改编辑器字体或配色的入口——字体名、89 处配色立即数写死在 `AutoShop.exe`，选区、默认底色、光标等视图默认色写死在 `SciLexer.dll`。本工具按站点原地改写这些立即数：不增删字节（DLL 侧闪白修复需追加一个 512 字节的节），随时可一键还原。

> ⚠️ 非官方工具。修改的是本地安装的 AutoShop，请自行评估风险并先做好备份（本工具会自动备份）。
> 请确认你对所修改的软件拥有合法授权。

---

## 为什么需要它：字体回退问题

AutoShop 的编辑器基于 **Scintilla**，字体是编译期常量。原始 exe 里那 7 处字体初始化代码请求的是**三种不同的字体**：

| 站点 | 原始请求的字体 |
|---|---|
| site1 | `Consolas` |
| site2 – site5 | `Lucida Sans Typewriter` |
| site6 – site7 | `Microsoft YaHei` |

**`Lucida Sans Typewriter` 已不再随 Windows 或 Office 分发。** 当系统里找不到指定字体时，Windows 会**静默回退**到默认字体（中文环境下是 **宋体**），既不报错也不提示。

因此编辑器实际显示的往往不是程序请求的字体，而是宋体。本工具把这 7 处统一指向**你系统里确实装了的字体**，从根上消除回退。

---

## 环境要求

- Windows 10 / 11
- Node.js 18 或更高（推荐 20+）
- 已安装的 AutoShop（默认路径 `C:\Inovance Control\AutoShop\AutoShop.exe`）

无需第三方 npm 依赖。

---

## 使用

### 图形界面（推荐）

双击 **`启动工具.cmd`**，浏览器会自动打开界面。界面分「字体」「配色」两个页签，两项互不影响：

**字体页**

- **当前字体**：当前已应用的字体名（异常时才会展开逐站点明细）
- **切换字体**：下拉框列出系统里**真实已安装**的字体（避免拼错导致静默回退），选中后点"应用字体"
- 也可以手动输入字体名，点"应用自定义字体"

**配色页**

- **主题预设**：亮色（恢复原始配色）/ 暗色（VSCode Dark+ 风格）/ Atom One Dark / GitHub Dark
- **逐部分调色**：预设下方列出 19 个部分（背景、注释、关键字、控制关键字、数字、常量/TRUE、函数名、函数调用、字符串、字符串变体、变量/标识符、类型/特殊、预处理/指令、正则/特殊符号、特殊符号2、运算符/亮绿、行号/空白标记、行高亮、选区），每项一个色块+色号，都可以单独修改。改动任意一项，预设自动切换为「自定义（当前编辑）」，下方预览框立即按新颜色重绘
- **应用配色**：只写配色站点（exe 89 处 + `SciLexer.dll` 9 处），不动字体
- 自定义主题可以反复微调：上次应用的色表记录在 `AutoShop.exe.patch.json`，在原基础上继续修改、再次应用即可
- **还原**：从备份完整恢复 exe 与 DLL，并摘掉闪白修复的注入节

**修改前请先关闭 AutoShop。** 工具会自动检测；若软件正在运行会拒绝修改。若软件以管理员权限运行，普通权限无法结束它，需要你手动关闭。

### 命令行

```bash
node bin/autoshop-font-patcher.mjs status                         # 查看状态与逐点字节预检
node bin/autoshop-font-patcher.mjs list                           # 列出内置字体与空闲区容量
node bin/autoshop-font-patcher.mjs install                        # 应用默认字体（Consolas）
node bin/autoshop-font-patcher.mjs install --font "Cascadia Mono" # 只换字体（不动配色）
node bin/autoshop-font-patcher.mjs install --theme dark           # 只应用暗色主题（不动字体）
node bin/autoshop-font-patcher.mjs install --theme original       # 恢复原始配色（含 DLL 侧改动）
node bin/autoshop-font-patcher.mjs revert                         # 从备份完整还原
```

命令行提供「暗色 / 原始」两档常用值；Atom One Dark 与 GitHub Dark 也能直接把内置键传给 `--theme`（见下）。逐部分调色只在图形界面中完成，应用结果同样记录在 `AutoShop.exe.patch.json` 里。

```bash
node bin/autoshop-font-patcher.mjs install --theme atomOneDark
node bin/autoshop-font-patcher.mjs install --theme githubDark
```

自定义色表（逐部分调色）只由图形界面提供，命令行传 `--theme custom` 会因缺少色表被拒绝；色表保存在补丁记录里，界面下次打开会自动载入，可以在此基础上继续微调。

### 自检

```bash
node scripts/selftest.mjs              # 只读校验 PE 结构、地址换算、7 处字体站点、89 处配色站点、DLL 站点
node scripts/e2e.mjs                   # 对运行中的界面服务跑接口与行为测试
node scripts/test-flashfix-embed.mjs   # 闪白修复注入/幂等/还原往返 + 真实 LoadLibrary 验证
```

---

## 配色主题

### 内置预设

| 预设 | 背景 | 关键字 | 注释 | 字符串 |
|---|---|---|---|---|
| 暗色（VSCode Dark+） | `#1E1E1E` | `#569CD6` | `#6A9955` | `#CE9178` |
| Atom One Dark | `#282C34` | `#C678DD` | `#5C6370` | `#98C379` |
| GitHub Dark | `#0D1117` | `#FF7B72` | `#8B949E` | `#A5D6FF` |
| 亮色 | AutoShop 原始配色（逐站点写回原值） |

每个预设都是完整色表（19 个部分逐一取色），不是只改几种语法色。

### 逐部分自定义

- 主题表为每个配色站点标注了 `kind` 与 `role`：`fore` 按角色查色、`back` 用背景色，行高亮（`highlight`）与选区（`selection`）同样按角色取色；exe 里没有光标站点，光标由下文 `SciLexer.dll` 侧的补丁负责。
- 类名为 `codepage` 的站点不参与主题：它保存的是 `0xFDE9`（65001 = UTF-8 代码页），任何主题包括自定义都保持原值。
- 自定义色表保存在 `AutoShop.exe.patch.json` 的 `customColors` 字段；从任意主题切到自定义、或在自定义基础上继续微调，预检都会接受已识别的现值。

### 深色主题附带的 DLL 侧改动

深色主题下，以下三类颜色不在 exe 的消息站点里，由工具直接改 `SciLexer.dll`（亮色时自动还原）：

1. **白色光标**：Scintilla 的系统 caret 位图是 1bpp 全零位图（黑色），工具把 `memset` 填充值改为 `0xFF`。
2. **选区遮罩 / 默认底色**：视图控件构造期的默认值（原银灰选区、白色底），改为主题的选区色与背景色。
3. **切窗闪白修复**：部署 `flashfix.dll`，并把 `SciLexer.dll` 的导入表扩展为同时加载它；它在进程内把编辑器父窗口类的背景刷换成主题底色。

切回「亮色」时，上述 DLL 改动全部还原；`revert` 会一并恢复。

---

## 还原

任何时候都能一键还原：

- 界面：点"还原为原始版本"
- 命令行：`node bin/autoshop-font-patcher.mjs revert`

还原会从备份文件**完整覆盖** exe，逐字节恢复原状；`SciLexer.dll` 同样从备份恢复，闪白修复追加的节一并摘除。还原前会核对当前哈希，若文件被其他程序改动过会中止，避免覆盖你的改动。

首次打补丁时会自动生成：

| 文件 | 说明 |
|---|---|
| `AutoShop.exe.bak` | 原始 exe 完整备份（约 55 MB）。**删了就无法还原** |
| `AutoShop.exe.orig.json` | 原始哈希记录 |
| `AutoShop.exe.patch.json` | 当前补丁状态记录（字体、主题、配色站点、闪白修复） |
| `SciLexer.dll.bak` | 原始 DLL 完整备份（约 468 KB），首次改 DLL 时生成 |

---

## 技术原理

细节见 **[docs/how-it-works.md](docs/how-it-works.md)**，这里只给结论。

**字体补丁点**：全 exe 共 7 处字体初始化代码，形态为

```asm
push <字体名字符串地址>
push 0x20                    ; Scintilla 的 DEFAULT_STYLE
mov  ecx, [obj+0x58]
call 0xBD12A0                ; 该函数内部发 SCI_STYLESETFONT(2050)
                             ;        与 SCI_STYLESETCHARACTERSET(2066)
```

改写 `push` 的 4 字节立即数即可，**不增删任何字节，文件大小不变**。

**配色补丁点**：配色初始化代码在 exe 里有多份拷贝，共 **89 处**站点，形态为 `push <颜色立即数>; push <样式号>; call 包装器`，包装器分别发 `SCI_STYLESETFORE`(2051)、`SCI_STYLESETBACK`(2052)、`SCI_SETCARETLINEBACK`(2098) 等消息。Scintilla 颜色为 COLORREF `0x00BBGGRR` 字节序，主题表写 `#RRGGBB` 由工具转换。

**DLL 补丁点**：`SciLexer.dll` 共 9 处（白色光标 1 处、选区默认色 3 处、默认底色 5 处），均为单条 `mov`/`push` 立即数改写。

**闪白修复**：给 `SciLexer.dll` 追加 `.ffix` 节并把 `flashfix.dll!FlashFixInit` 加入导入表，加载 DLL 时由系统一并拉起修复 DLL；修复 DLL 在进程内轮询，把 `Scintilla` 窗口的父窗口背景刷改成 `flashfix.ini` 中的主题底色。

**字体名来源**：

- exe 里已有的字符串 —— 纯指针改写，不写入新字节
- exe 里没有的字体名 —— 写入 `.rdata` 中一处空闲区（文件偏移 `0x1B2C7A9`，容量 60 字节）

**两条硬性要求**（工具会强制校验）：

1. 地址必须**经段表换算**：`VA = 段.VirtAddr + (文件偏移 - 段.RawPtr) + ImageBase`，不能简化为 `文件偏移 + ImageBase`。
2. 字体名落点的**虚拟地址必须落在段 `VirtSize` 之内**。段的 `RawSize` 常大于 `VirtSize`，超出部分只存在于文件、不会被加载进内存；写入这类区域会让补丁"显示已应用"但实际无效。工具在写入前做落点体检，不满足即拒绝。

**运行检测**：软件常以管理员权限启动，此时普通权限读不到进程路径。检测按"进程名 → 路径 → 基名"逐级确认，仍无法确认身份时**按运行中处理并拒绝修改**。

详见 [docs/how-it-works.md](docs/how-it-works.md)。

---

## 兼容性

本工具的地址与偏移**针对特定版本的 AutoShop 硬编码**。

**测试所用版本：AutoShop V4.12.0.2**（发布者 Inovance Technology Co., Ltd）

如果 AutoShop 升级导致 exe 或 `SciLexer.dll` 变化，工具会在写入前做逐字节预检并**安全中止**（不会盲改）。届时需要重新定位站点 —— 方法见 [docs/how-it-works.md](docs/how-it-works.md#4-如何重新定位)。

已在以下环境验证：

| 项 | 值 |
|---|---|
| 操作系统 | Windows 11 |
| AutoShop 版本 | **V4.12.0.2** |
| AutoShop.exe 大小 | `55,592,960` 字节 |
| 原始 exe SHA-256 | `22efbe0e…` |
| SciLexer.dll 大小 | 原始 `478,720` 字节；注入闪白修复后 `479,232` 字节 |

---

## 目录结构

```
autoshop-font-patcher/
├── bin/
│   ├── autoshop-font-patcher.mjs   命令行入口
│   ├── autoshop-font-ui.mjs        图形界面入口（本地服务 + 浏览器）
│   └── autoshop-finish.mjs         收尾：确认已关闭后应用并独立校验
├── lib/
│   ├── patch.mjs                   补丁核心（字体站点、落点、构建与应用）
│   ├── theme.mjs                   配色站点表与主题（Dark+ / Atom One Dark / GitHub Dark / 自定义）
│   ├── scilexer.mjs                SciLexer.dll 站点（选区/光标/默认底色）
│   ├── flashfix.mjs                闪白修复：给 DLL 挂 flashfix.dll 导入 / 还原
│   ├── pe.mjs                      PE 解析与地址换算
│   ├── process.mjs                 AutoShop 运行检测（fail-closed）
│   └── fonts.mjs                   已安装字体枚举
├── assets/
│   └── flashfix.dll                进程内修复 DLL（源码见 build/flashfix/）
├── build/flashfix/
│   ├── flashfix.c / flashfix.dll   闪白修复源码（TDM-GCC -m32 -shared）
│   ├── loader.c / loader.exe       离线加载验证
│   └── testhost.c / testhost.exe   独立验证宿主
├── web/
│   └── page.mjs                    界面页面（字体 / 配色两个页签）
├── scripts/
│   ├── selftest.mjs                只读自检
│   ├── e2e.mjs                     端到端测试
│   ├── test-flashfix-embed.mjs     flashfix 注入/还原/装载离线验证
│   └── recon-theme*.mjs            配色站点侦察脚本（只读）
├── docs/
│   └── how-it-works.md             技术细节与复现方法
├── 启动工具.cmd
├── 清理残留服务.cmd / .ps1
└── README.md
```

---

## 许可

[MIT](LICENSE)。与汇川技术（Inovance）无任何关联，未使用其任何代码或资源。
