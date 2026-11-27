package io.github.marcelmolitor.tetherlume;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.provider.Settings;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.widget.*;
import android.view.*;
public class MainActivity extends Activity {
 LinearLayout root; TextView status; boolean registered=false; boolean de;
 final int navy=Color.rgb(8,24,49), card=Color.rgb(17,45,79), blue=Color.rgb(83,177,255);
 final BroadcastReceiver power=new BroadcastReceiver(){public void onReceive(Context c,Intent i){refresh();}};
 String t(String german,String english){return de?german:english;}
 int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
 GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
 TextView text(String s,int size,int color,boolean bold){TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(color);if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;}
 void add(View v,int gap){LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(gap);root.addView(v,lp);}
 void button(String s,Runnable action){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextSize(16);b.setTextColor(Color.WHITE);b.setBackground(bg(Color.rgb(20,91,178),16));b.setMinHeight(dp(54));b.setOnClickListener(v->action.run());add(b,12);}
 void settings(String action){try{startActivity(new Intent(action));}catch(Exception e){startActivity(new Intent(Settings.ACTION_SETTINGS));}}
 @Override public void onCreate(Bundle b){super.onCreate(b);de=java.util.Locale.getDefault().getLanguage().equals("de");getWindow().setStatusBarColor(navy);getWindow().setNavigationBarColor(navy);
 ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(navy);root=new LinearLayout(this);root.setOrientation(1);root.setPadding(dp(24),dp(24),dp(24),dp(24));scroll.addView(root);
 if(android.os.Build.VERSION.SDK_INT>=35)scroll.setOnApplyWindowInsetsListener((v,i)->{android.graphics.Insets a=i.getInsets(WindowInsets.Type.systemBars());v.setPadding(a.left,a.top,a.right,a.bottom);return i;});
 setContentView(scroll);
 ImageView logo=new ImageView(this);logo.setImageResource(io.github.marcelmolitor.tetherlume.R.drawable.logo);LinearLayout.LayoutParams il=new LinearLayout.LayoutParams(dp(64),dp(64));il.bottomMargin=dp(12);root.addView(logo,il);
 add(text("TETHERLUME  /  ANDROID",13,blue,true),12);add(text(t("Dein Handy.\nDein Desktop.","Your phone.\nYour desktop."),34,Color.WHITE,true),12);add(text(t("Dein Begleiter für Tetherlume unter Windows.","Your companion for Tetherlume on Windows."),17,0xffb7cde5,false),24);
 status=text("",18,Color.WHITE,true);status.setBackground(bg(card,20));status.setPadding(dp(20),dp(20),dp(20),dp(20));add(status,22);refresh();
 add(text(t("Verbindung einrichten","Set up your connection"),20,Color.WHITE,true),12);
 button(t("1  ·  Entwickleroptionen öffnen","1  ·  Open developer options"),()->settings(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
 button(t("2  ·  Geräteinformationen öffnen","2  ·  Open device information"),()->settings(Settings.ACTION_DEVICE_INFO_SETTINGS));
 add(text(t("Aktiviere USB-Debugging, verbinde ein Datenkabel und bestätige den PC-Dialog nur bei einem vertrauenswürdigen Computer.","Enable USB debugging, attach a data cable and approve the computer prompt only for a trusted PC."),15,0xffb7cde5,false),20);
 button(t("3  ·  Tetherlume für Windows","3  ·  Tetherlume for Windows"),()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://marcelmolitor.github.io/android-desk/")));}catch(Exception e){Toast.makeText(this,t("Kein Browser verfügbar","No browser available"),Toast.LENGTH_SHORT).show();}});
 button(t("Status aktualisieren","Refresh status"),()->refresh());
 add(text(t("Privat by design · Keine App-Berechtigungen · Keine Telemetrie","Private by design · No app permissions · No telemetry"),13,blue,false),16);add(text("Developed in Germany  ·  v0.1.0",13,0xffb7cde5,false),0);
 }
 void refresh(){if(status==null)return;Intent b=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));int plug=b==null?0:b.getIntExtra("plugged",0);boolean usb=plug==android.os.BatteryManager.BATTERY_PLUGGED_USB;boolean adb=Settings.Global.getInt(getContentResolver(),Settings.Global.ADB_ENABLED,0)==1;status.setText(t("GERÄTESTATUS","DEVICE STATUS")+"\n\n"+(usb?t("USB-Strom erkannt","USB power detected"):t("Kein USB-Strom erkannt","No USB power detected"))+"\n"+(adb?t("USB-Debugging aktiviert","USB debugging enabled"):t("USB-Debugging deaktiviert","USB debugging disabled"))+"\n\n"+t("PC-Verbindung nicht verifiziert","PC connection not verified"));}
 @Override protected void onResume(){super.onResume();refresh();}
}