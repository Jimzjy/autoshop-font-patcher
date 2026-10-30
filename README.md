# AutoShop 编辑器字体与配色工具

修改汇川 **AutoShop**（PLC 编程软件）代码编辑器的**字体**和**配色**，支持暗色主题与逐项自定义颜色，随时可一键还原。

> ⚠️ 非官方工具。修改的是本地安装的 AutoShop，请自行评估风险（工具会自动备份，可完整还原）。

## 环境要求

- Windows 10 / 11
- Node.js 18 或更高
- 已安装的 AutoShop（默认路径 `C:\Inovance Control\AutoShop\AutoShop.exe`）

适配版本：AutoShop V4.12.0.2（其他版本会在写入前安全中止，不会盲改）。

## 图形界面（推荐）

双击 **`启动工具.cmd`**，浏览器会自动打开界面。

**修改前请先关闭 AutoShop。** 工具会自动检测，软件在运行时会拒绝修改。

界面分「字体」「配色」两个页签，互不影响：

- **字体页**：下拉框列出系统里已安装的字体，选中后点「应用字体」；也可以手动输入字体名。
- **配色页**：
  - 主题预设：亮色（原始配色）/ 暗色（VSCode Dark+）/ Atom One Dark / GitHub Dark
  - 每个预设下方列出 19 个部分（背景、注释、关键字、字符串等），每项都能用色块单独改色，改完下方预览实时更新；改动任意一项即变为「自定义」主题
  - 点「应用配色」生效（应用暗色主题时同时修复切换窗口闪白的问题）
  - 自定义主题可反复微调，重新打开界面会自动载入上次的自定义颜色

## 命令行

```bash
node bin/autoshop-font-patcher.mjs status                         # 查看当前状态
node bin/autoshop-font-patcher.mjs install --font "Cascadia Mono" # 只换字体
node bin/autoshop-font-patcher.mjs install --theme dark           # 只应用暗色主题
node bin/autoshop-font-patcher.mjs install --theme atomOneDark    # Atom One Dark
node bin/autoshop-font-patcher.mjs install --theme githubDark     # GitHub Dark
node bin/autoshop-font-patcher.mjs install --theme original       # 恢复原始配色
node bin/autoshop-font-patcher.mjs revert                         # 从备份完整还原
```

逐项自定义颜色只在图形界面提供。

## 还原

任何时候都能一键还原：界面点「还原为原始版本」，或命令行 `revert`。还原从备份完整恢复 exe 与 DLL，逐字节回到原始状态。

首次打补丁时会在 AutoShop 目录自动生成备份（`AutoShop.exe.bak`、`SciLexer.dll.bak` 等）。**备份文件删了就无法还原**，请勿手动清理。

## 技术细节

实现原理与站点定位方法见 [docs/how-it-works.md](docs/how-it-works.md)。

## 许可

[MIT](LICENSE)。与汇川技术（Inovance）无任何关联，未使用其任何代码或资源。
