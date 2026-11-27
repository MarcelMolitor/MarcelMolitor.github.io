#define UNICODE
#define _UNICODE
#include <windows.h>
#include <winhttp.h>
#include <process.h>
#include <commdlg.h>
#include <shellapi.h>
#include <strsafe.h>
#include <wchar.h>
#include <stdio.h>

static const wchar_t *settings = L"Software\\Molitor\\AndroidDesk";
static HANDLE session;
static HANDLE wifiProbe;
#define WM_WIFI_RESULT (WM_APP+12)
struct Probe { HWND window; wchar_t host[32]; wchar_t path[96]; };
static BOOL german;
static HFONT headingFont;
static HBRUSH backgroundBrush;
static HBRUSH headerBrush;
static HBRUSH statusBrush;
static const wchar_t *tr(const wchar_t *en,const wchar_t *de) { return german ? de : en; }
static void localize(HWND w) {
    SetDlgItemTextW(w,107,tr(L"Wi-Fi first. USB optional.",L"WLAN zuerst. USB optional."));
    SetDlgItemTextW(w,108,tr(L"Connect one unlocked Android device with a data cable. Enable USB debugging and approve access on the device.",L"Verbinde ein entsperrtes Android-Gerät per Datenkabel. Aktiviere USB-Debugging und bestätige den Zugriff."));
    SetDlgItemTextW(w,101,tr(L"Turn off phone screen on launch",L"Handydisplay beim Start ausschalten"));
    SetDlgItemTextW(w,102,tr(L"Open device",L"Gerät öffnen"));
    SetDlgItemTextW(w,103,tr(L"Record MP4 ...",L"MP4 aufnehmen ..."));
    SetDlgItemTextW(w,104,tr(L"Help",L"Hilfe"));
    SetDlgItemTextW(w,109,tr(L"Language / Sprache",L"Sprache / Language"));
    SetDlgItemTextW(w,113,tr(L"Developed in Germany  |  Local USB connection",L"Entwickelt in Deutschland  |  Lokale USB-Verbindung"));
    SetDlgItemTextW(w,115,tr(L"DEVICE CONNECTION",L"GERÄTEVERBINDUNG"));
    SetDlgItemTextW(w,116,tr(L"STATUS",L"STATUS"));
    SetDlgItemTextW(w,117,tr(L"Start sharing in Tetherlume Android and paste its local link here.",L"Starte die Bildschirmfreigabe in Tetherlume Android und füge den lokalen Link hier ein."));
    SetDlgItemTextW(w,122,tr(L"Paste link",L"Link einfügen"));
    SetDlgItemTextW(w,124,tr(L"Test connection",L"Verbindung testen"));
    SetDlgItemTextW(w,123,tr(L"Wi-Fi help",L"WLAN-Hilfe"));
    SetDlgItemTextW(w,119,tr(L"Open Wi-Fi screen",L"WLAN-Bildschirm öffnen"));
    SetDlgItemTextW(w,120,tr(L"Android app",L"Android-App"));
    SetDlgItemTextW(w,121,tr(L"USB control (optional)",L"USB-Steuerung (optional)"));
    SetDlgItemTextW(w,113,tr(L"Developed in Germany | Local connection",L"Entwickelt in Deutschland | Lokale Verbindung"));
    CheckRadioButton(w,110,111,german?111:110);
}
static void status(HWND w, const wchar_t *s) { SetDlgItemTextW(w,105,s); }

/* Accept only the application's private IPv4 HTTP session URL. No shell command. */
static BOOL wifi_url(const wchar_t *url) {
    unsigned a,b,c,d; int n=0;
    if (swscanf(url,L"http://%u.%u.%u.%u:8080/?k=%n",&a,&b,&c,&d,&n)!=4 || n<=0) return FALSE;
    if(a>255||b>255||c>255||d>255) return FALSE;
    wchar_t canonical[80];
    if(FAILED(StringCchPrintfW(canonical,80,L"http://%u.%u.%u.%u:8080/?k=",a,b,c,d)) || wcsncmp(url,canonical,wcslen(canonical))!=0) return FALSE;
    if(!(a==10||(a==192&&b==168)||(a==172&&b>=16&&b<=31))) return FALSE;
    const wchar_t *key=url+n; size_t len=wcslen(key);
    if(len!=32) return FALSE;
    for(size_t i=0;i<len;i++){wchar_t x=key[i];if(!((x>=L'0'&&x<=L'9')||(len==32&&((x>=L'A'&&x<=L'Z')||(x>=L'a'&&x<=L'z')||x==L'-'||x==L'_'))))return FALSE;}
    return TRUE;
}
static unsigned __stdcall probe_worker(void *arg) {
    struct Probe *p=arg;
    HINTERNET h=WinHttpOpen(L"Tetherlume Desktop",WINHTTP_ACCESS_TYPE_NO_PROXY,NULL,NULL,0);
    HINTERNET c=NULL,r=NULL; DWORD result=0, code=0, bytes=sizeof(code);
    if(h){
        WinHttpSetTimeouts(h,2000,2000,2000,2500);
        c=WinHttpConnect(h,p->host,8080,0);
        if(c) r=WinHttpOpenRequest(c,L"GET",p->path,NULL,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,0);
        if(r){
            DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
            if(WinHttpSetOption(r,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect)) &&
               WinHttpSendRequest(r,WINHTTP_NO_ADDITIONAL_HEADERS,0,WINHTTP_NO_REQUEST_DATA,0,0,0) &&
               WinHttpReceiveResponse(r,NULL) &&
               WinHttpQueryHeaders(r,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,WINHTTP_HEADER_NAME_BY_INDEX,&code,&bytes,WINHTTP_NO_HEADER_INDEX)) result=code;
        }
    }
    if(r) WinHttpCloseHandle(r); if(c) WinHttpCloseHandle(c); if(h) WinHttpCloseHandle(h);
    HWND w=p->window; SecureZeroMemory(p,sizeof(*p)); HeapFree(GetProcessHeap(),0,p);
    PostMessageW(w,WM_WIFI_RESULT,result,0);
    return 0;
}
static void test_wifi(HWND w) {
    if(wifiProbe) return;
    wchar_t url[256]; GetDlgItemTextW(w,118,url,256);
    if(!wifi_url(url)){status(w,tr(L"Paste the complete session link first.",L"Zuerst den vollständigen Sitzungslink einfügen."));return;}
    struct Probe *p=HeapAlloc(GetProcessHeap(),HEAP_ZERO_MEMORY,sizeof(*p));
    if(!p){status(w,tr(L"Not enough memory.",L"Nicht genügend Speicher."));return;}
    p->window=w;
    const wchar_t *end=wcschr(url+7,L':');
    StringCchCopyNW(p->host,32,url+7,end-(url+7));
    StringCchCopyW(p->path,96,end+5);
    SecureZeroMemory(url,sizeof(url));
    wifiProbe=(HANDLE)_beginthreadex(NULL,0,probe_worker,p,0,NULL);
    if(!wifiProbe){HeapFree(GetProcessHeap(),0,p);status(w,tr(L"Test could not start.",L"Test konnte nicht gestartet werden."));return;}
    EnableWindow(GetDlgItem(w,124),FALSE);
    status(w,tr(L"Checking local Wi-Fi connection…",L"Lokale WLAN-Verbindung wird geprüft…"));
}
static void paste_wifi(HWND w) {
    if(!OpenClipboard(w)){status(w,tr(L"Clipboard unavailable.",L"Zwischenablage nicht verfügbar."));return;}
    HANDLE data=GetClipboardData(CF_UNICODETEXT);
    wchar_t url[256]=L"";
    if(data){const wchar_t *v=GlobalLock(data);if(v){SIZE_T bytes=GlobalSize(data);size_t max=bytes/sizeof(wchar_t),i=0;while(i<max&&i<255&&v[i]){url[i]=v[i];i++;}url[i]=0;GlobalUnlock(data);}}
    CloseClipboard();
    if(!wifi_url(url)){status(w,tr(L"No valid private session link in clipboard.",L"Kein gültiger privater Sitzungslink in der Zwischenablage."));return;}
    SetDlgItemTextW(w,118,url);
    status(w,tr(L"Link ready. Open Wi-Fi screen to connect.",L"Link bereit. WLAN-Bildschirm öffnen, um zu verbinden."));
}
static void open_wifi(HWND w) {
    wchar_t url[512];
    GetDlgItemTextW(w,118,url,512);
    if(!wifi_url(url)){status(w,tr(L"Paste the full local link from the Android app.",L"Bitte den vollständigen lokalen Link aus der Android-App einfügen."));return;}
    INT_PTR result=(INT_PTR)ShellExecuteW(w,L"open",url,NULL,NULL,SW_SHOWNORMAL);
    if(result<=32){status(w,tr(L"Could not open browser.",L"Browser konnte nicht geöffnet werden."));return;}
    SetDlgItemTextW(w,118,L"");
    status(w,tr(L"Browser requested. HTTP is not encrypted. Use trusted Wi-Fi only.",L"Browser angefordert. HTTP ist unverschlüsselt. Nur privates WLAN nutzen."));
}
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
    status(w,found ? tr(L"Ready for Wi-Fi sharing or optional USB control.",L"Bereit für WLAN-Freigabe oder optionale USB-Steuerung.") :
        tr(L"Wi-Fi available independently. For USB, reinstall scrcpy using setup.",L"WLAN unabhängig nutzbar. Für USB bitte das Setup erneut ausführen."));
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
    if (FAILED(StringCchPrintfW(cmd,32768,L"\"%ls\" --select-usb --no-audio --no-clipboard-autosync --window-title=Tetherlume%ls%ls%ls%ls",exe,
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
        german=language!=0; localize(w); SendDlgItemMessageW(w,118,EM_LIMITTEXT,255,0); refresh(w); return TRUE;
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
        case 124: test_wifi(w); return TRUE;
        case 122: paste_wifi(w); return TRUE;
        case 123: ShellExecuteW(w,L"open",L"https://marcelmolitor.github.io/tetherlume/web/#wifi",NULL,NULL,SW_SHOWNORMAL); return TRUE;
        case 119: open_wifi(w); return TRUE;
        case 120: ShellExecuteW(w,L"open",L"https://github.com/MarcelMolitor/MarcelMolitor.github.io/releases/download/tetherlume-android-latest/Tetherlume.apk",NULL,NULL,SW_SHOWNORMAL); return TRUE;
        case 102: case 103: launch(w,LOWORD(wp)==103); return TRUE;
        case 104: ShellExecuteW(w,L"open",tr(L"https://marcelmolitor.github.io/android-desk/?lang=en",L"https://marcelmolitor.github.io/android-desk/de.html?lang=de"),NULL,NULL,SW_SHOWNORMAL); return TRUE;
        case IDCANCEL: SendMessageW(w,WM_CLOSE,0,0); return TRUE;
        }
    }
    if (msg==WM_TIMER && session && WaitForSingleObject(session,0)==WAIT_OBJECT_0) {
        DWORD code=1; GetExitCodeProcess(session,&code); CloseHandle(session); session=NULL;
        KillTimer(w,1); EnableWindow(GetDlgItem(w,110),TRUE); EnableWindow(GetDlgItem(w,111),TRUE); refresh(w);
        if (code) {
            wchar_t detail[768];
            StringCchPrintfW(detail,768,tr(L"Connection ended (exit code %lu). Unlock the phone, approve USB debugging, use a data cable and close other ADB tools.",L"Verbindung beendet (Fehlercode %lu). Handy entsperren, USB-Debugging bestätigen, Datenkabel nutzen und andere ADB-Programme schließen."),(unsigned long)code);
            status(w,detail);

        } else status(w,tr(L"Session ended.",L"Sitzung beendet."));
        return TRUE;
    }
    if(msg==WM_WIFI_RESULT){
        if(wifiProbe){CloseHandle(wifiProbe);wifiProbe=NULL;}
        EnableWindow(GetDlgItem(w,124),TRUE);
        status(w,wp==200?tr(L"Local HTTP session responded. Open Wi-Fi screen to view.",L"Lokale HTTP-Sitzung antwortet. WLAN-Bildschirm öffnen.") : wp==403?tr(L"Session rejected. Copy a fresh link from the app.",L"Sitzung abgelehnt. Neuen Link aus der App kopieren.") : tr(L"No usable response. Check Wi-Fi, sharing and session link.",L"Keine nutzbare Antwort. WLAN, Freigabe und Sitzungslink prüfen."));return TRUE;
    }
    if (msg==WM_CLOSE) {
        if(wifiProbe){status(w,tr(L"Connection test is still running.",L"Verbindungstest läuft noch."));return TRUE;}
        if (session) { MessageBoxW(w,tr(L"Close the mirrored device window first to save any active recording.",L"Schließe zuerst das gespiegelte Gerätefenster, damit die Aufnahme gespeichert wird."),L"Tetherlume",MB_OK); return TRUE; }
        EndDialog(w,0); return TRUE;
    }
    return FALSE;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE prev,PWSTR args,int show) {
    (void)prev;(void)args;(void)show; SetProcessDPIAware();
    return DialogBoxParamW(instance,MAKEINTRESOURCEW(100),NULL,dialog,0)==-1?1:0;
}
