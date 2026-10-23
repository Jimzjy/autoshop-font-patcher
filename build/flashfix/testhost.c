// 离线验证宿主：注册白色刷子的窗口类 + 名为 Scintilla 的子窗口，
// 加载 flashfix.dll 后检查父窗口类刷子是否被换成暗色。
#include <windows.h>
#include <stdio.h>

static void P(const char *fmt, ...) {
    va_list ap; char buf[512]; FILE *f;
    va_start(ap, fmt); _vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
    printf("%s\n", buf);
    f = fopen("verify.log", "a"); if (f) { fprintf(f, "%s\n", buf); fclose(f); }
}

int main(void) {
    WNDCLASSA wc; HWND top, child; HBRUSH before, after;
    HMODULE dll;

    DeleteFileA("verify.log");
    ZeroMemory(&wc, sizeof wc);
    wc.lpfnWndProc = DefWindowProcA;
    wc.hInstance = GetModuleHandleA(NULL);
    wc.lpszClassName = "FlashFixTestHost";
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);   // 与 MFC 视图类同样的白刷子
    if (!RegisterClassA(&wc)) { P("RegisterClass host 失败"); return 1; }

    ZeroMemory(&wc, sizeof wc);
    wc.lpfnWndProc = DefWindowProcA;
    wc.hInstance = GetModuleHandleA(NULL);
    wc.lpszClassName = "Scintilla";                   // 只用类名匹配
    if (!RegisterClassA(&wc)) { P("RegisterClass Scintilla 失败"); return 1; }

    top = CreateWindowExA(0, "FlashFixTestHost", "host", WS_OVERLAPPEDWINDOW,
                          0, 0, 400, 300, NULL, NULL, GetModuleHandleA(NULL), NULL);
    if (!top) { P("CreateWindow 失败"); return 1; }
    child = CreateWindowExA(0, "Scintilla", "child", WS_CHILD | WS_VISIBLE,
                            0, 0, 100, 100, top, NULL, GetModuleHandleA(NULL), NULL);
    if (!child) { P("CreateWindow child 失败"); return 1; }

    before = (HBRUSH)GetClassLongA(top, GCL_HBRBACKGROUND);
    P("注入前: 父类背景刷=0x%X (6=白色系统刷子)", (unsigned)(ULONG_PTR)before);

    dll = LoadLibraryA("flashfix.dll");
    if (!dll) { P("LoadLibrary flashfix.dll 失败 err=%lu", GetLastError()); return 1; }
    Sleep(1500);

    after = (HBRUSH)GetClassLongA(top, GCL_HBRBACKGROUND);
    P("注入后: 父类背景刷=0x%X", (unsigned)(ULONG_PTR)after);
    P(after != before ? "结果: 已修复" : "结果: 未生效");
    DestroyWindow(top);
    return after != before ? 0 : 2;
}
