#define AppName "Android Desk"
#define AppVersion "0.2"
[Setup]
AppId=Molitor.AndroidDesk
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Marcel Molitor
AppPublisherURL=https://marcelmolitor.github.io/android-desk/
DefaultDirName={localappdata}\Programs\Android Desk
DefaultGroupName=Android Desk
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=Android-Desk-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\Android-Desk.exe
LicenseFile=..\LICENSE

[Files]
Source: "payload\Android-Desk.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE-Android-Desk.txt"; Flags: ignoreversion
Source: "THIRD-PARTY.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{tmp}\android-desk-scrcpy\scrcpy-win64-v5.0.1\*"; DestDir: "{app}\scrcpy"; Flags: external recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Android Desk"; Filename: "{app}\Android-Desk.exe"
Name: "{group}\Android Desk deinstallieren"; Filename: "{uninstallexe}"

[Code]
var
  DownloadPage: TDownloadWizardPage;

function PSQuote(Value: String): String;
begin
  StringChangeEx(Value, '''', '''''', True);
  Result := Value;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage('scrcpy herunterladen',
    'Das originale scrcpy wird direkt von Genymobile bezogen und überprüft.', nil);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
  ArchivePath, TargetPath, Params: String;
begin
  Result := '';
  ArchivePath := ExpandConstant('{tmp}\scrcpy-win64-v5.0.1.zip');
  TargetPath := ExpandConstant('{tmp}\android-desk-scrcpy');
  DownloadPage.Clear;
  DownloadPage.Add(
    'https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip',
    'scrcpy-win64-v5.0.1.zip',
    'b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5');
  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
      Params := '-NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath ''' +
        PSQuote(ArchivePath) + ''' -DestinationPath ''' +
        PSQuote(TargetPath) + ''' -Force -ErrorAction Stop"';
      if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params, '',
        SW_HIDE, ewWaitUntilTerminated, ExitCode) then
        RaiseException('PowerShell konnte nicht gestartet werden.');
      if ExitCode <> 0 then RaiseException('scrcpy konnte nicht entpackt werden.');
      if not FileExists(TargetPath + '\scrcpy-win64-v5.0.1\scrcpy.exe') then
        RaiseException('scrcpy.exe fehlt im Archiv.');
    except
      Result := GetExceptionMessage;
    end;
  finally
    DownloadPage.Hide;
  end;
end;
