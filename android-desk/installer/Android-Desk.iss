#define AppName "Tetherlume"
#define AppVersion "0.6"
[Setup]
AppId=Molitor.AndroidDesk
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Marcel Molitor
AppPublisherURL=https://marcelmolitor.github.io/android-desk/
DefaultDirName={localappdata}\Programs\Tetherlume
DefaultGroupName=Tetherlume
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=Tetherlume-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\Android-Desk.exe
LicenseFile=..\LICENSE

[Files]
Source: "payload\Android-Desk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE-Android-Desk.txt"; Flags: ignoreversion
Source: "THIRD-PARTY.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\scrcpy\*"; DestDir: "{app}\scrcpy"; Flags: recursesubdirs createallsubdirs ignoreversion

Source: "..\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Icons]
Name: "{group}\Tetherlume"; Filename: "{app}\Android-Desk.exe"
Name: "{group}\Uninstall Tetherlume"; Filename: "{uninstallexe}"


[UninstallDelete]
Type: files; Name: "{app}\PRIVACY.md"
