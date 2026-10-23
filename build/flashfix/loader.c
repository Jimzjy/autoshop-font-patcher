// 离线验证用加载器：加载指定 DLL，检查 flashfix.dll 是否被它的导入表拉进来。
// gcc -m32 -o loader.exe loader.c
#include <windows.h>
#include <stdio.h>

int main(int argc, char **argv) {
    HMODULE h, f;
    if (argc < 2) { printf("usage: loader <dll>\n"); return 2; }
    h = LoadLibraryA(argv[1]);
    if (!h) { printf("LOADFAIL %lu\n", GetLastError()); return 1; }
    f = GetModuleHandleA("flashfix.dll");
    printf("SCILEXER=%p FLASHFIX=%p\n", (void *)h, (void *)f);
    return f ? 0 : 3;
}
