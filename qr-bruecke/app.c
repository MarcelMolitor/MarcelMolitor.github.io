#include "qrcodegen.h"
#include <string.h>
#include <ctype.h>
static uint8_t qr[qrcodegen_BUFFER_LEN_MAX], temp[qrcodegen_BUFFER_LEN_MAX];
static int encode(const char *url){
    size_t prefix=!strncmp(url,"https://",8)?8:!strncmp(url,"http://",7)?7:0;
    if(!prefix||url[prefix]=='/'||url[prefix]=='?'||url[prefix]=='#'||!url[prefix])return 0;
    for(const unsigned char *s=(const unsigned char *)url;*s;s++)if(*s<=32||*s==127)return 0;
    return qrcodegen_encodeText(url,temp,qr,qrcodegen_Ecc_MEDIUM,1,18,qrcodegen_Mask_AUTO,true);
}
#ifdef _WIN32
#include <windows.h>
static HBITMAP bmp;
static void clear(HWND w){
    SendDlgItemMessageW(w,103,STM_SETIMAGE,IMAGE_BITMAP,0);
    if(bmp){DeleteObject(bmp);bmp=NULL;}
}
static INT_PTR CALLBACK window(HWND w,UINT msg,WPARAM key,LPARAM param){
    if(msg==WM_INITDIALOG){SendDlgItemMessageW(w,101,EM_SETLIMITTEXT,480,0);return TRUE;}
    if(msg==WM_COMMAND && LOWORD(key)==101 && HIWORD(key)==EN_CHANGE){clear(w);SetDlgItemTextW(w,104,L"");return TRUE;}
    if(msg==WM_COMMAND && LOWORD(key)==102){
        wchar_t input[481];char url[1950];GetDlgItemTextW(w,101,input,481);clear(w);
        if(!WideCharToMultiByte(CP_UTF8,0,input,-1,url,sizeof(url),NULL,NULL)||!encode(url)){
            SetDlgItemTextW(w,104,L"Bitte einen kurzen http(s)-Link ohne Leerzeichen eingeben.");return TRUE;}
        int n=qrcodegen_getSize(qr);RECT r;GetClientRect(GetDlgItem(w,103),&r);
        int zoom=(r.right<r.bottom?r.right:r.bottom)/(n+8);if(zoom<1)return TRUE;
        int side=zoom*(n+8);BITMAPINFO bi={0};bi.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
        bi.bmiHeader.biWidth=side;bi.bmiHeader.biHeight=-side;bi.bmiHeader.biPlanes=1;bi.bmiHeader.biBitCount=32;
        uint32_t *pixels;bmp=CreateDIBSection(NULL,&bi,DIB_RGB_COLORS,(void**)&pixels,NULL,0);
        if(!bmp){SetDlgItemTextW(w,104,L"Bild konnte nicht erstellt werden.");return TRUE;}
        for(int y=0;y<side;y++)for(int x=0;x<side;x++)
            pixels[y*side+x]=qrcodegen_getModule(qr,x/zoom-4,y/zoom-4)?0:0x00FFFFFF;
        SendDlgItemMessageW(w,103,STM_SETIMAGE,IMAGE_BITMAP,(LPARAM)bmp);
        SetDlgItemTextW(w,104,L"Jetzt mit der Kamera des Smartphones scannen.");return TRUE;
    }
    if(msg==WM_CLOSE||(msg==WM_COMMAND&&LOWORD(key)==IDCANCEL)){clear(w);EndDialog(w,0);return TRUE;}
    return FALSE;
}
int WINAPI wWinMain(HINSTANCE h,HINSTANCE prev,PWSTR cmd,int show){SetProcessDPIAware();return DialogBoxParamW(h,MAKEINTRESOURCEW(100),NULL,window,0)==-1;}
#else
#include <stdio.h>
int main(int n,char **a){if(n!=2||!encode(a[1]))return 1;int size=qrcodegen_getSize(qr)+8;
 printf("P1\n%d %d\n",size,size);for(int y=0;y<size;y++){for(int x=0;x<size;x++)printf("%d ",qrcodegen_getModule(qr,x-4,y-4));puts("");}return 0;}
#endif
