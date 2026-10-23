// flashfix.dll —— 消除 AutoShop 编辑器切窗闪白
//
// 原理：编辑器父窗口类 AfxFrameOrView90u 注册时带 (COLOR_WINDOW+1) 白色系统刷子，
// 控件重绘前父窗口先擦一帧白，产生闪白。跨进程 SetClassLong 被系统拒绝（err=5），
// 只能在本进程内改。本 DLL 由 SciLexer.dll 的导入表引入，随编辑器加载进 AutoShop。
//
// 颜色取自同目录 flashfix.ini：color=RRGGBB（工具在应用暗色主题时写入编辑器背景色，
// 使擦除帧与编辑器底色一致，视觉上不可见）。
#include <windows.h>
#include <string.h>
#include <stdio.h>

static HBRUSH g_brush = NULL;

static COLORREF load_color(void) {
    COLORREF cr = RGB(0x1E, 0x1E, 0x1E);
    char path[MAX_PATH], buf[256];
    DWORD n = 0;
    HANDLE h;
    HMODULE self = NULL;
    char *p, *s;
    unsigned v = 0;

    if (!GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            (LPCSTR)&load_color, &self) || !self)
        return cr;
    if (!GetModuleFileNameA(self, path, MAX_PATH)) return cr;
    p = path + lstrlenA(path);
    while (p > path && *p != '\\') p--;
    lstrcpynA(p + 1, "flashfix.ini", MAX_PATH - (int)(p + 1 - path));

    h = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h == INVALID_HANDLE_VALUE) return cr;
    ReadFile(h, buf, sizeof(buf) - 1, &n, NULL);
    CloseHandle(h);
    buf[n] = 0;

    s = strstr(buf, "color=");
    if (s && sscanf(s + 6, "%x", &v) == 1)
        cr = RGB((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
    return cr;
}

static BOOL CALLBACK fix_child(HWND hwnd, LPARAM lp) {
    char cls[64];
    (void)lp;
    if (GetClassNameA(hwnd, cls, sizeof cls) > 0 && lstrcmpA(cls, "Scintilla") == 0) {
        HWND parent = GetParent(hwnd);
        if (parent && (LONG)(LONG_PTR)g_brush != GetClassLongA(parent, GCL_HBRBACKGROUND))
            SetClassLongA(parent, GCL_HBRBACKGROUND, (LONG)(LONG_PTR)g_brush);
    }
    return TRUE;
}

static BOOL CALLBACK fix_top(HWND hwnd, LPARAM lp) {
    (void)lp;
    EnumChildWindows(hwnd, fix_child, 0);
    return TRUE;
}

static DWORD WINAPI worker(LPVOID p) {
    (void)p;
    for (;;) {
        EnumWindows(fix_top, 0);
        Sleep(500);
    }
    return 0;
}

// 由 SciLexer.dll 导入表引用的占位导出（实际工作由 DllMain 完成，此函数不会被调用）
__declspec(dllexport) void FlashFixInit(void) {}

BOOL WINAPI DllMain(HINSTANCE h, DWORD reason, LPVOID r) {
    (void)r;
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(h);
        g_brush = CreateSolidBrush(load_color());
        if (g_brush) CreateThread(NULL, 0, worker, NULL, 0, NULL);
    }
    return TRUE;
}
