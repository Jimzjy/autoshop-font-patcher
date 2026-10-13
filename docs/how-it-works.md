# 技术细节

补丁原理、站点定位方法，以及 AutoShop 升级后的重新适配步骤。

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

## 6. 验证记录

**测试版本：AutoShop V4.12.0.2**

| 项 | 结果 |
|---|---|
| CLI 状态 / 自检 | 28 项通过 |
| 端到端（界面接口 + 应用 + 还原）| 24 项通过，1 项跳过 |
| 还原闭环 | 打补丁 → 还原 → 哈希与原始逐字节一致 → 重新打补丁 → 哈希与首次一致 |
| 与原始差异 | 仅 7 处 push 的立即数（共 10 字节）+ 空闲区字体名 |
| 文件大小 | 补丁前后完全一致，未增删字节 |
| 提权进程拦截 | 正确识别并拒绝修改 |
| 端口占用 | 自动顺延到下一个可用端口 |

字体实际显示效果需在 AutoShop 中人工确认（原生 GUI，无法自动化验证）。
