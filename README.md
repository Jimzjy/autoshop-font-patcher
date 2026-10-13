# AutoShop 编辑器字体修改工具

修改汇川 **AutoShop**（PLC 编程软件）代码/指令表编辑器的字体。

AutoShop 本身**没有**提供修改编辑器字体的入口 —— 字体名被写死在可执行文件里。本工具通过改写 7 处 `push` 指令的立即数，让它们统一指向你指定的字体，并可随时一键还原。

> ⚠️ 非官方工具。修改的是本地安装的 AutoShop.exe，请自行评估风险并先做好备份（本工具会自动备份）。
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

双击 **`启动工具.cmd`**，浏览器会自动打开界面：

- **当前状态**：7 处引用点分别指向哪个字体、文件哈希、落点体检结果
- **切换字体**：下拉框列出系统里**真实已安装**的字体（避免拼错导致静默回退），选中后点"应用"
- **还原**：从备份完整恢复原始 exe

**修改前请先关闭 AutoShop。** 工具会自动检测；若软件正在运行会拒绝修改。若软件以管理员权限运行，普通权限无法结束它，需要你手动关闭。

### 命令行

```bash
node bin/autoshop-font-patcher.mjs status                        # 查看状态与逐点字节预检
node bin/autoshop-font-patcher.mjs list                          # 列出内置字体与空闲区容量
node bin/autoshop-font-patcher.mjs install                       # 应用默认字体（Consolas）
node bin/autoshop-font-patcher.mjs install --font "Cascadia Mono" # 换成指定字体
node bin/autoshop-font-patcher.mjs revert                        # 从备份完整还原
```

### 自检

```bash
node scripts/selftest.mjs   # 只读校验 PE 结构、地址换算、7 处站点、落点体检
node scripts/e2e.mjs        # 对运行中的界面服务跑接口与行为测试
```

---

## 还原

任何时候都能一键还原：

- 界面：点"还原为原始版本"
- 命令行：`node bin/autoshop-font-patcher.mjs revert`

还原会从备份文件**完整覆盖** exe，逐字节恢复原状。还原前会核对当前哈希，若文件被其他程序改动过会中止，避免覆盖你的改动。

首次打补丁时会自动生成：

| 文件 | 说明 |
|---|---|
| `AutoShop.exe.bak` | 原始 exe 完整备份（约 55 MB）。**删了就无法还原** |
| `AutoShop.exe.orig.json` | 原始哈希记录 |
| `AutoShop.exe.patch.json` | 当前补丁状态记录 |

---

## 技术原理

细节见 **[docs/how-it-works.md](docs/how-it-works.md)**，这里只给结论。

**补丁点**：全 exe 共 7 处字体初始化代码，形态为

```asm
push <字体名字符串地址>
push 0x20                    ; Scintilla 的 DEFAULT_STYLE
mov  ecx, [obj+0x58]
call 0xBD12A0                ; 该函数内部发 SCI_STYLESETFONT(2050)
                             ;        与 SCI_STYLESETCHARACTERSET(2066)
```

改写 `push` 的 4 字节立即数即可，**不增删任何字节，文件大小不变**。

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

本工具的地址与偏移**针对特定版本的 AutoShop.exe 硬编码**。

**测试所用版本：AutoShop V4.12.0.2**（发布者 Inovance Technology Co., Ltd）

如果 AutoShop 升级导致 exe 变化，工具会在写入前做逐字节预检并**安全中止**（不会盲改）。届时需要重新定位这 7 处站点 —— 方法见 [docs/how-it-works.md](docs/how-it-works.md#如何重新定位)。

已在以下环境验证：

| 项 | 值 |
|---|---|
| 操作系统 | Windows 11 |
| AutoShop 版本 | **V4.12.0.2** |
| AutoShop.exe 大小 | `55,592,960` 字节 |
| 原始版本 SHA-256 | `22efbe0e…` |

---

## 目录结构

```
autoshop-font-patcher/
├── bin/
│   ├── autoshop-font-patcher.mjs   命令行入口
│   ├── autoshop-font-ui.mjs        图形界面入口（本地服务 + 浏览器）
│   └── autoshop-finish.mjs         收尾：确认已关闭后应用并独立校验
├── lib/
│   ├── patch.mjs                   补丁核心（站点表、落点、构建与应用）
│   ├── pe.mjs                      PE 解析与地址换算
│   ├── process.mjs                 AutoShop 运行检测（fail-closed）
│   └── fonts.mjs                   已安装字体枚举
├── web/
│   └── page.mjs                    界面页面
├── scripts/
│   ├── selftest.mjs                只读自检
│   └── e2e.mjs                     端到端测试
├── docs/
│   └── how-it-works.md             技术细节与复现方法
├── 启动工具.cmd
├── 清理残留服务.cmd / .ps1
└── README.md
```

---

## 许可

[MIT](LICENSE)。与汇川技术（Inovance）无任何关联，未使用其任何代码或资源。
