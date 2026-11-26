#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_ONLY_PNG
#define STBI_NO_HDR
#define STBI_NO_LINEAR
#define STBI_MAX_DIMENSIONS 32768
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image.h"
#include "stb_image_write.h"
#include <stdint.h>
#define CAP 999999u
typedef struct { unsigned char data[CAP]; size_t count; } Jpeg;
static void collect(void *ctx, void *bytes, int n) {
    Jpeg *j=ctx;
    if(j->count>CAP) return;
    if((size_t)n>CAP-j->count){j->count=CAP+1;return;}
    memcpy(j->data+j->count,bytes,n);j->count+=n;
}
static int compress_photo(FILE *in,Jpeg *out){
    int w,h,c;
    if(!stbi_info_from_file(in,&w,&h,&c)||w<1||h<1||(int64_t)w*h>36000000) return 0;
    rewind(in);
    unsigned char *px=stbi_load_from_file(in,&w,&h,&c,4);
    if(!px)return 0;
    for(size_t i=0;i<(size_t)w*h;i++){
        int alpha=px[4*i+3];
        for(int k=0;k<3;k++) px[3*i+k]=(px[4*i+k]*alpha+255*(255-alpha)+127)/255;
    }
    for(;;){
        for(int q=90;q>=54;q-=12){
            out->count=0;
            if(stbi_write_jpg_to_func(collect,out,w,h,3,px,q)&&out->count<=CAP&&out->count>0){
                stbi_image_free(px);return 1;
            }
        }
        int nw=(w+1)/2,nh=(h+1)/2;
        if(w==1&&h==1) break;
        for(int y=0;y<nh;y++)for(int x=0;x<nw;x++)for(int k=0;k<3;k++){
            unsigned sum=0,n=0;
            for(int dy=0;dy<2 && 2*y+dy<h;dy++)for(int dx=0;dx<2 && 2*x+dx<w;dx++){
                sum+=px[((size_t)(2*y+dy)*w+2*x+dx)*3+k];n++;
            }
            px[((size_t)y*nw+x)*3+k]=(unsigned char)((sum+n/2)/n);
        }
        w=nw;h=nh;
    }
    stbi_image_free(px);return 0;
}
static Jpeg jpeg;
#ifdef _WIN32
#include <windows.h>
#include <commdlg.h>
#include <wchar.h>
int WINAPI wWinMain(HINSTANCE h,HINSTANCE prev,PWSTR cmd,int show){
    wchar_t src[MAX_PATH]=L"",dest[MAX_PATH]=L"Foto-unter-1-MB.jpg",message[220];
    OPENFILENAMEW dlg={0};dlg.lStructSize=sizeof(dlg);dlg.hInstance=h;
    dlg.lpstrTitle=L"FotoLimit · Foto auswählen";dlg.lpstrFilter=L"JPEG und PNG\0*.jpg;*.jpeg;*.png\0";
    dlg.lpstrFile=src;dlg.nMaxFile=MAX_PATH;dlg.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
    if(!GetOpenFileNameW(&dlg))return 0;
    FILE *f=_wfopen(src,L"rb");int ok=f&&compress_photo(f,&jpeg);if(f)fclose(f);
    if(!ok){MessageBoxW(NULL,L"Bitte eine lesbare JPEG- oder PNG-Datei mit höchstens 36 Megapixeln wählen.",L"FotoLimit",MB_ICONWARNING);return 1;}
    dlg.lpstrTitle=L"FotoLimit · Neue JPEG-Kopie speichern";dlg.lpstrFile=dest;
    dlg.lpstrFilter=L"JPEG-Bild\0*.jpg\0";dlg.lpstrDefExt=L"jpg";dlg.Flags=OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
    for(;;){
        if(!GetSaveFileNameW(&dlg))return 0;
        HANDLE file=CreateFileW(dest,GENERIC_WRITE,0,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,NULL);
        if(file==INVALID_HANDLE_VALUE){MessageBoxW(NULL,L"Bitte einen freien Dateinamen und einen beschreibbaren Ordner auswählen.",L"FotoLimit",MB_ICONWARNING);continue;}
        DWORD n=0;ok=WriteFile(file,jpeg.data,(DWORD)jpeg.count,&n,NULL)&&n==jpeg.count&&FlushFileBuffers(file);
        CloseHandle(file);
        if(!ok){DeleteFileW(dest);MessageBoxW(NULL,L"Speichern fehlgeschlagen.",L"FotoLimit",MB_ICONERROR);return 1;}
        swprintf(message,220,L"JPEG-Kopie gespeichert: %lu Bytes. Das Original bleibt erhalten.",(unsigned long)n);
        MessageBoxW(NULL,message,L"MOLITOR FotoLimit",MB_OK);return 0;
    }
}
#else
int main(int argc,char **argv){
    if(argc!=3)return 1;
    FILE *in=fopen(argv[1],"rb");if(!in)return 1;
    int ok=compress_photo(in,&jpeg);fclose(in);if(!ok)return 1;
    FILE *out=fopen(argv[2],"wbx");if(!out)return 1;
    ok=fwrite(jpeg.data,1,jpeg.count,out)==jpeg.count;return fclose(out)||!ok;
}
#endif
