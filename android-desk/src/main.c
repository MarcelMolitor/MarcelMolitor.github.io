#define UNICODE
#define _UNICODE
#include <windows.h>
#include <commdlg.h>
#include <shellapi.h>
#include <strsafe.h>
#include <wchar.h>
#include <stdio.h>

static const wchar_t *settings = L"Software\\Molitor\\AndroidDesk";
static HANDLE session;
static wchar_t logPath[MAX_PATH];
static void status(HWND w, const wchar_t *s) { SetDlgItemTextW(w,105,s); }

static BOOL executable(wchar_t *out, DWORD size) {
    wchar_t local[32768];
    DWORD n = GetModuleFileNameW(NULL, local, 32768);
    if (n && n < 32768) {
        wchar_t *slash = wcsrchr(local, L'\\');
        if (slash) {
            slash[1] = 0;
            if (SUCCEEDED(StringCchCatW(local,32768,L"scrcpy\\scrcpy.exe")) &&
                GetFileAttributesW(local) != INVALID_FILE_ATTRIBUTES &&
                SUCCEEDED(StringCchCopyW(out,size,local))) return TRUE;
        }
    }
    wchar_t path[32768];
    DWORD len = GetEnvironmentVariableW(L"PATH",path,32768);
    if (!len || len >= 32768) return FALSE;
    len = SearchPathW(path,L"scrcpy.exe",NULL,size,out,NULL);
    return len > 0 && len < size;
}
static void refresh(HWND w) {
    wchar_t exe[32768];
    BOOL found = executable(exe,32768);
    EnableWindow(GetDlgItem(w,102),found);
    EnableWindow(GetDlgItem(w,103),found);
    status(w,found ? L"Ready. Connect an Android device and choose an action." :
        L"scrcpy is missing. Run the Tetherlume setup again, or install scrcpy separately.");
}
static void launch(HWND w, BOOL record) {
    wchar_t exe[32768], cmd[32768], output[MAX_PATH] = L"", tmp[MAX_PATH];
    if (session || !executable(exe,32768)) { if (!session) refresh(w); return; }
    if (record) {
        SYSTEMTIME t; GetLocalTime(&t);
        StringCchPrintfW(output,MAX_PATH,L"Android-%04u-%02u-%02u_%02u-%02u-%02u.mp4",
            t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond);
        OPENFILENAMEW file = {0}; file.lStructSize=sizeof(file); file.hwndOwner=w;
        file.lpstrFilter=L"MP4-Video (*.mp4)\0*.mp4\0"; file.lpstrFile=output;
        file.nMaxFile=MAX_PATH; file.lpstrDefExt=L"mp4";
        file.Flags=OFN_OVERWRITEPROMPT|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
        if (!GetSaveFileNameW(&file)) return;
    }
    BOOL dark = IsDlgButtonChecked(w,101)==BST_CHECKED;
    if (FAILED(StringCchPrintfW(cmd,32768,L"\"%ls\" --select-usb%ls%ls%ls%ls",exe,
        dark?L" --turn-screen-off":L"", record?L" --record=\"":L"", output,record?L"\"":L""))) {
        status(w,L"The file path is too long."); return;
    }
    DWORD n = GetTempPathW(MAX_PATH,tmp);
    if (!n || n >= MAX_PATH || !GetTempFileNameW(tmp,L"MAD",0,logPath)) {
        status(w,L"Could not create a temporary log file."); return;
    }
    SECURITY_ATTRIBUTES sa={sizeof(sa),NULL,TRUE};
    HANDLE log=CreateFileW(logPath,GENERIC_WRITE,FILE_SHARE_READ,&sa,TRUNCATE_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    HANDLE input=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&sa,OPEN_EXISTING,0,NULL);
    STARTUPINFOW si={0}; si.cb=sizeof(si); si.dwFlags=STARTF_USESTDHANDLES;
    si.hStdOutput=si.hStdError=log; si.hStdInput=input;
    PROCESS_INFORMATION pi={0};
    BOOL ok=log!=INVALID_HANDLE_VALUE && input!=INVALID_HANDLE_VALUE &&
        CreateProcessW(exe,cmd,NULL,NULL,TRUE,CREATE_NO_WINDOW,NULL,NULL,&si,&pi);
    if (log!=INVALID_HANDLE_VALUE) CloseHandle(log);
    if (input!=INVALID_HANDLE_VALUE) CloseHandle(input);
    if (!ok) { DeleteFileW(logPath); status(w,L"Could not launch scrcpy."); return; }
    CloseHandle(pi.hThread); session=pi.hProcess;
    EnableWindow(GetDlgItem(w,102),FALSE); EnableWindow(GetDlgItem(w,103),FALSE);
    status(w, record ? L"Recording started. Close the device window to finalize the MP4 file." :
        L"scrcpy started. Approve USB debugging on your device if prompted.");
    SetTimer(w,1,500,NULL);
}
static INT_PTR CALLBACK dialog(HWND w,UINT msg,WPARAM wp,LPARAM lp) {
    (void)lp;
    if (msg==WM_INITDIALOG) {
        HICON icon=LoadIconW(GetModuleHandleW(NULL),MAKEINTRESOURCEW(1));
        SendMessageW(w,WM_SETICON,ICON_BIG,(LPARAM)icon); SendMessageW(w,WM_SETICON,ICON_SMALL,(LPARAM)icon);
        DWORD value=0, size=sizeof(value);
        RegGetValueW(HKEY_CURRENT_USER,settings,L"ScreenOff",RRF_RT_REG_DWORD,NULL,&value,&size);
        CheckDlgButton(w,101,value?BST_CHECKED:BST_UNCHECKED); refresh(w); return TRUE;
    }
    if (msg==WM_COMMAND) {
        switch (LOWORD(wp)) {
        case 101: {
            DWORD value=IsDlgButtonChecked(w,101)==BST_CHECKED;
            RegSetKeyValueW(HKEY_CURRENT_USER,settings,L"ScreenOff",REG_DWORD,&value,sizeof(value)); return TRUE;
        }
        case 102: case 103: launch(w,LOWORD(wp)==103); return TRUE;
        case 104: ShellExecuteW(w,L"open",L"https://marcelmolitor.github.io/android-desk/",NULL,NULL,SW_SHOWNORMAL); return TRUE;
        case IDCANCEL: SendMessageW(w,WM_CLOSE,0,0); return TRUE;
        }
    }
    if (msg==WM_TIMER && session && WaitForSingleObject(session,0)==WAIT_OBJECT_0) {
        DWORD code=1; GetExitCodeProcess(session,&code); CloseHandle(session); session=NULL;
        KillTimer(w,1); refresh(w);
        if (code) {
            status(w,L"Connection ended. Check your data cable, debugging permission and that exactly one USB device is connected.");
            if (MessageBoxW(w,L"scrcpy reported an error. Open the technical log in Notepad?",L"Tetherlume",MB_YESNO|MB_ICONINFORMATION)==IDYES) {
                wchar_t editor[MAX_PATH], quoted[MAX_PATH+3];
                if (GetSystemDirectoryW(editor, MAX_PATH) &&
                    SUCCEEDED(StringCchCatW(editor, MAX_PATH, L"\\notepad.exe")) &&
                    SUCCEEDED(StringCchPrintfW(quoted, MAX_PATH+3, L"\"%ls\"", logPath)))
                    ShellExecuteW(w,L"open",editor,quoted,NULL,SW_SHOWNORMAL);
                return TRUE;
            }
        } else status(w,L"Session ended.");
        DeleteFileW(logPath); return TRUE;
    }
    if (msg==WM_CLOSE) {
        if (session) { MessageBoxW(w,L"Close the mirrored device window first to save any active recording.",L"Tetherlume",MB_OK); return TRUE; }
        EndDialog(w,0); return TRUE;
    }
    return FALSE;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE prev,PWSTR args,int show) {
    (void)prev;(void)args;(void)show; SetProcessDPIAware();
    return DialogBoxParamW(instance,MAKEINTRESOURCEW(100),NULL,dialog,0)==-1?1:0;
}
