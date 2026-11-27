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
static BOOL german;
static HFONT headingFont;
static HBRUSH backgroundBrush;
static HBRUSH headerBrush;
static HBRUSH statusBrush;
static const wchar_t *tr(const wchar_t *en,const wchar_t *de) { return german ? de : en; }
static void localize(HWND w) {
    SetDlgItemTextW(w,107,tr(L"Control your phone over USB",L"Smartphone per USB steuern"));
    SetDlgItemTextW(w,108,tr(L"Connect one unlocked Android device with a data cable. Enable USB debugging and approve access on the device.",L"Verbinde ein entsperrtes Android-Gerät per Datenkabel. Aktiviere USB-Debugging und bestätige den Zugriff."));
    SetDlgItemTextW(w,101,tr(L"Turn off phone screen on launch",L"Handydisplay beim Start ausschalten"));
    SetDlgItemTextW(w,102,tr(L"Open device",L"Gerät öffnen"));
    SetDlgItemTextW(w,103,tr(L"Record MP4 ...",L"MP4 aufnehmen ..."));
    SetDlgItemTextW(w,104,tr(L"Help",L"Hilfe"));
    SetDlgItemTextW(w,109,tr(L"Language / Sprache",L"Sprache / Language"));
    SetDlgItemTextW(w,113,tr(L"Developed in Germany  |  Local USB connection",L"Entwickelt in Deutschland  |  Lokale USB-Verbindung"));
    SetDlgItemTextW(w,115,tr(L"DEVICE CONNECTION",L"GERÄTEVERBINDUNG"));
    SetDlgItemTextW(w,116,tr(L"STATUS",L"STATUS"));
    CheckRadioButton(w,110,111,german?111:110);
}
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
    status(w,found ? tr(L"Ready. Connect an Android device and choose an action.",L"Bereit. Verbinde ein Android-Gerät und wähle eine Aktion.") :
        tr(L"scrcpy is missing. Run the Tetherlume setup again, or install scrcpy separately.",L"scrcpy fehlt. Führe das Tetherlume-Setup erneut aus."));
}
static void launch(HWND w, BOOL record) {
    wchar_t exe[32768], cmd[32768], output[MAX_PATH] = L"";
    if (session || !executable(exe,32768)) { if (!session) refresh(w); return; }
    if (record) {
        SYSTEMTIME t; GetLocalTime(&t);
        StringCchPrintfW(output,MAX_PATH,L"Android-%04u-%02u-%02u_%02u-%02u-%02u.mp4",
            t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond);
        OPENFILENAMEW file = {0}; file.lStructSize=sizeof(file); file.hwndOwner=w;
        file.lpstrFilter=L"MP4-Video (*.mp4)\0*.mp4\0"; file.lpstrFile=output;
        file.nMaxFile=MAX_PATH; file.lpstrDefExt=L"mp4"; file.lpstrTitle=tr(L"Save MP4 recording",L"MP4-Aufnahme speichern");
        file.Flags=OFN_OVERWRITEPROMPT|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR|OFN_DONTADDTORECENT;
        if (!GetSaveFileNameW(&file)) return;
    }
    BOOL dark = IsDlgButtonChecked(w,101)==BST_CHECKED;
    if (FAILED(StringCchPrintfW(cmd,32768,L"\"%ls\" --select-usb --no-audio --no-clipboard-autosync%ls%ls%ls%ls",exe,
        dark?L" --turn-screen-off":L"", record?L" --record=\"":L"", output,record?L"\"":L""))) {
        status(w,tr(L"The file path is too long.",L"Der Dateipfad ist zu lang.")); return;
    }
    SECURITY_ATTRIBUTES sa={sizeof(sa),NULL,TRUE};
    HANDLE log=CreateFileW(L"NUL",GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,&sa,OPEN_EXISTING,0,NULL);
    HANDLE input=CreateFileW(L"NUL",GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE,&sa,OPEN_EXISTING,0,NULL);
    STARTUPINFOW si={0}; si.cb=sizeof(si); si.dwFlags=STARTF_USESTDHANDLES;
    si.hStdOutput=si.hStdError=log; si.hStdInput=input;
    PROCESS_INFORMATION pi={0};
    BOOL ok=log!=INVALID_HANDLE_VALUE && input!=INVALID_HANDLE_VALUE &&
        CreateProcessW(exe,cmd,NULL,NULL,TRUE,CREATE_NO_WINDOW,NULL,NULL,&si,&pi);
    if (log!=INVALID_HANDLE_VALUE) CloseHandle(log);
    if (input!=INVALID_HANDLE_VALUE) CloseHandle(input);
    if (!ok) { status(w,tr(L"Could not launch scrcpy.",L"scrcpy konnte nicht gestartet werden.")); return; }
    CloseHandle(pi.hThread); session=pi.hProcess;
    EnableWindow(GetDlgItem(w,102),FALSE); EnableWindow(GetDlgItem(w,103),FALSE);
    EnableWindow(GetDlgItem(w,110),FALSE); EnableWindow(GetDlgItem(w,111),FALSE);
    status(w, record ? tr(L"Recording started. Close the device window to finalize the MP4 file.",L"Aufnahme gestartet. Schließe das Gerätefenster, um die MP4-Datei fertigzustellen.") :
        tr(L"scrcpy started. Approve USB debugging on your device if prompted.",L"scrcpy gestartet. Bestätige bei Bedarf USB-Debugging auf dem Gerät."));
    SetTimer(w,1,500,NULL);
}
static INT_PTR CALLBACK dialog(HWND w,UINT msg,WPARAM wp,LPARAM lp) {
    (void)lp;
    if (msg==WM_INITDIALOG) {
        HIGHCONTRASTW hc={sizeof(hc)};
        BOOL highContrast=SystemParametersInfoW(SPI_GETHIGHCONTRAST,sizeof(hc),&hc,0)&&(hc.dwFlags&HCF_HIGHCONTRASTON);
        if(!highContrast){
        backgroundBrush=CreateSolidBrush(RGB(248,250,252));
        headerBrush=CreateSolidBrush(RGB(17,41,54));
        statusBrush=CreateSolidBrush(RGB(230,239,245));
        }
        HDC dc=GetDC(w);
        int dpi=dc?GetDeviceCaps(dc,LOGPIXELSY):96;
        if(dc) ReleaseDC(w,dc);
        headingFont=CreateFontW(-MulDiv(19,dpi,72),0,0,0,FW_SEMIBOLD,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Segoe UI");
        if(headingFont) SendDlgItemMessageW(w,112,WM_SETFONT,(WPARAM)headingFont,TRUE);
        HICON icon=LoadIconW(GetModuleHandleW(NULL),MAKEINTRESOURCEW(1));
        SendMessageW(w,WM_SETICON,ICON_BIG,(LPARAM)icon); SendMessageW(w,WM_SETICON,ICON_SMALL,(LPARAM)icon);
        DWORD value=0, size=sizeof(value);
        RegGetValueW(HKEY_CURRENT_USER,settings,L"ScreenOff",RRF_RT_REG_DWORD,NULL,&value,&size);
        CheckDlgButton(w,101,value?BST_CHECKED:BST_UNCHECKED);
        DWORD language=PRIMARYLANGID(GetUserDefaultUILanguage())==LANG_GERMAN?1:0;
        size=sizeof(value);
        if (RegGetValueW(HKEY_CURRENT_USER,settings,L"GermanUI",RRF_RT_REG_DWORD,NULL,&value,&size)==ERROR_SUCCESS) language=value;
        german=language!=0; localize(w); refresh(w); return TRUE;
    }
    if (msg==WM_CTLCOLORDLG && backgroundBrush) return (INT_PTR)backgroundBrush;
    if (msg==WM_CTLCOLORSTATIC && backgroundBrush && headerBrush && statusBrush) {
        HDC dc=(HDC)wp;
        int id=GetDlgCtrlID((HWND)lp);
        if(id==112 || id==107) {
            SetTextColor(dc,RGB(255,255,255)); SetBkColor(dc,RGB(17,41,54));
            return (INT_PTR)headerBrush;
        }
        if(id==105) {
            SetTextColor(dc,RGB(23,51,84)); SetBkColor(dc,RGB(230,239,245));
            return (INT_PTR)statusBrush;
        }
        SetTextColor(dc,RGB(23,51,84)); SetBkColor(dc,RGB(248,250,252));
        return (INT_PTR)backgroundBrush;
    }
    if (msg==WM_ERASEBKGND && backgroundBrush && headerBrush) {
        HDC dc=(HDC)wp; RECT r; GetClientRect(w,&r);
        FillRect(dc,&r,backgroundBrush);
        RECT header={0,0,350,57}; MapDialogRect(w,&header); header.right=r.right;
        FillRect(dc,&header,headerBrush);
        return TRUE;
    }
    if (msg==WM_DRAWITEM && wp==114) {
        DRAWITEMSTRUCT *d=(DRAWITEMSTRUCT*)lp;
        RECT flag=d->rcItem; HDC dc=d->hDC;
        int x=flag.left,y=flag.top;
        int width=flag.right-flag.left,height=flag.bottom-flag.top;
        COLORREF colors[]={RGB(20,20,20),RGB(221,32,41),RGB(255,206,0)};
        for(int i=0;i<3;i++){RECT stripe={x,y+i*height/3,x+width,y+(i+1)*height/3}; HBRUSH b=CreateSolidBrush(colors[i]); if(b){FillRect(dc,&stripe,b);DeleteObject(b);}}
        return TRUE;
    }
    if (msg==WM_DESTROY) {
        if(headingFont) DeleteObject(headingFont);
        if(backgroundBrush) DeleteObject(backgroundBrush);
        if(headerBrush) DeleteObject(headerBrush);
        if(statusBrush) DeleteObject(statusBrush);
        return FALSE;
    }
    if (msg==WM_COMMAND) {
        switch (LOWORD(wp)) {
        case 110: case 111: {
            german=LOWORD(wp)==111;
            DWORD value=german?1:0;
            RegSetKeyValueW(HKEY_CURRENT_USER,settings,L"GermanUI",REG_DWORD,&value,sizeof(value));
            localize(w);
            if (!session) refresh(w);
            return TRUE;
        }
        case 101: {
            DWORD value=IsDlgButtonChecked(w,101)==BST_CHECKED;
            RegSetKeyValueW(HKEY_CURRENT_USER,settings,L"ScreenOff",REG_DWORD,&value,sizeof(value)); return TRUE;
        }
        case 102: case 103: launch(w,LOWORD(wp)==103); return TRUE;
        case 104: ShellExecuteW(w,L"open",tr(L"https://marcelmolitor.github.io/android-desk/?lang=en",L"https://marcelmolitor.github.io/android-desk/de.html?lang=de"),NULL,NULL,SW_SHOWNORMAL); return TRUE;
        case IDCANCEL: SendMessageW(w,WM_CLOSE,0,0); return TRUE;
        }
    }
    if (msg==WM_TIMER && session && WaitForSingleObject(session,0)==WAIT_OBJECT_0) {
        DWORD code=1; GetExitCodeProcess(session,&code); CloseHandle(session); session=NULL;
        KillTimer(w,1); EnableWindow(GetDlgItem(w,110),TRUE); EnableWindow(GetDlgItem(w,111),TRUE); refresh(w);
        if (code) {
            status(w,tr(L"Connection ended. Check your data cable, debugging permission and that exactly one USB device is connected.",L"Verbindung beendet. Prüfe Datenkabel und USB-Freigabe. Verbinde genau ein USB-Gerät."));

        } else status(w,tr(L"Session ended.",L"Sitzung beendet."));
        return TRUE;
    }
    if (msg==WM_CLOSE) {
        if (session) { MessageBoxW(w,tr(L"Close the mirrored device window first to save any active recording.",L"Schließe zuerst das gespiegelte Gerätefenster, damit die Aufnahme gespeichert wird."),L"Tetherlume",MB_OK); return TRUE; }
        EndDialog(w,0); return TRUE;
    }
    return FALSE;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE prev,PWSTR args,int show) {
    (void)prev;(void)args;(void)show; SetProcessDPIAware();
    return DialogBoxParamW(instance,MAKEINTRESOURCEW(100),NULL,dialog,0)==-1?1:0;
}
