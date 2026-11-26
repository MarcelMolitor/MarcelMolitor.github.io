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
#include <math.h>
enum { W=1080,H=1920 };
static unsigned char *wallpaper(FILE *file){
    int w,h,ch;
    if(!stbi_info_from_file(file,&w,&h,&ch)||(int64_t)w*h>36000000||w<1||h<1)return NULL;
    rewind(file);unsigned char *src=stbi_load_from_file(file,&w,&h,&ch,4);
    if(!src)return NULL;
    unsigned char *dst=malloc(W*H*3);if(!dst){stbi_image_free(src);return NULL;}
    double scale=fmin(w/(double)W,h/(double)H),left=(w-W*scale)/2,top=(h-H*scale)/2;
    for(int y=0;y<H;y++)for(int x=0;x<W;x++){
        double sx=fmax(0,fmin(w-1,left+(x+.5)*scale-.5));
        double sy=fmax(0,fmin(h-1,top+(y+.5)*scale-.5));
        int ax=(int)sx,ay=(int)sy,bx=ax+(ax+1<w),by=ay+(ay+1<h);
        double wx=sx-ax,wy=sy-ay,weights[4]={(1-wx)*(1-wy),wx*(1-wy),(1-wx)*wy,wx*wy};
        size_t ids[4]={(size_t)ay*w+ax,(size_t)ay*w+bx,(size_t)by*w+ax,(size_t)by*w+bx};
        for(int k=0;k<3;k++){
            double color=0;
            for(int i=0;i<4;i++){unsigned char *p=src+4*ids[i];color+=weights[i]*(p[k]*p[3]/255.0+255-p[3]);}
            dst[(y*W+x)*3+k]=(unsigned char)fmin(255,color+.5);
        }
    }stbi_image_free(src);return dst;
}
typedef struct{FILE *f;int ok;} Writer;
static void write_chunk(void *c,void *p,int n){Writer *w=c;if(w->ok)w->ok=fwrite(p,1,n,w->f)==(size_t)n;}
static int save(FILE *f,unsigned char *pixels){Writer w={f,1};int ok=stbi_write_jpg_to_func(write_chunk,&w,W,H,3,pixels,92);return fclose(f)==0&&ok&&w.ok;}
#ifdef _WIN32
#include <windows.h>
#include <commdlg.h>
#include <wchar.h>
int WINAPI wWinMain(HINSTANCE h,HINSTANCE prev,PWSTR cmd,int show){
    wchar_t name[MAX_PATH]=L"",dest[MAX_PATH]=L"Hintergrund-1080x1920.jpg";
    OPENFILENAMEW d={0};d.lStructSize=sizeof(d);d.nMaxFile=MAX_PATH;d.lpstrFile=name;d.lpstrTitle=L"DisplayFit · Foto für mittigen 9:16-Ausschnitt auswählen";
    d.lpstrFilter=L"JPEG und PNG\0*.jpg;*.jpeg;*.png\0";d.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST;
    if(!GetOpenFileNameW(&d))return 0;FILE *f=_wfopen(name,L"rb");unsigned char *px=f?wallpaper(f):NULL;if(f)fclose(f);
    if(!px){MessageBoxW(NULL,L"Das Bild konnte nicht gelesen werden. Unterstützt werden JPEG und PNG bis 36 Megapixel.",L"DisplayFit",MB_ICONERROR);return 1;}
    d.lpstrFile=dest;d.lpstrDefExt=L"jpg";d.lpstrTitle=L"DisplayFit · Neue JPEG-Kopie speichern";d.lpstrFilter=L"JPEG-Bild\0*.jpg\0";d.Flags=OFN_PATHMUSTEXIST;
    while(GetSaveFileNameW(&d)){f=_wfopen(dest,L"wbx");if(!f){MessageBoxW(NULL,L"Bitte einen neuen Dateinamen und einen beschreibbaren Ordner wählen.",L"DisplayFit",MB_ICONWARNING);continue;}
        int ok=save(f,px);if(!ok)DeleteFileW(dest);free(px);
        MessageBoxW(NULL,ok?L"Dein 1080 × 1920-Hintergrund wurde gespeichert.":L"Speichern fehlgeschlagen.",L"DisplayFit",ok?MB_OK:MB_ICONERROR);return !ok;}
    free(px);return 0;
}
#else
int main(int argc,char **argv){if(argc!=3)return 1;FILE *f=fopen(argv[1],"rb");if(!f)return 1;
 unsigned char *px=wallpaper(f);fclose(f);if(!px)return 1;f=fopen(argv[2],"wbx");int ok=f&&save(f,px);free(px);return !ok;}
#endif
