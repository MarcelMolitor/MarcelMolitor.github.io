# Run on Windows with PowerShell. Generates candidate singleton manifests, not a submission.
param(
    [Parameter(Mandatory=$true)][string]$ReleaseBaseUrl,
    [Parameter(Mandatory=$true)][string]$ArtifactDirectory,
    [Parameter(Mandatory=$true)][string]$License,
    [Parameter(Mandatory=$true)][string]$LicenseUrl,
    [string]$OutputDirectory = ".\winget-manifests"
)
$ErrorActionPreference = 'Stop'
if ($ReleaseBaseUrl -notmatch '^https://[^\s]+$' -or $LicenseUrl -notmatch '^https://[^\s]+$') { throw 'HTTPS URLs required.' }
function Quote-Yaml([string]$Value) { "'" + $Value.Replace("'","''") + "'" }
$apps = @(
    @{Id='Molitor.AndroidDesk'; Name='MOLITOR Android Desk'; Version='0.1'; File='MOLITOR-Android-Desk.exe'; Description='Android per USB am Windows-PC steuern.'; Dependency=$true},
    @{Id='Molitor.FotoLimit'; Name='MOLITOR FotoLimit'; Version='1.0'; File='MOLITOR-FotoLimit.exe'; Description='Fotos lokal zu kleinen JPEG-Dateien verkleinern.'},
    @{Id='Molitor.QRBruecke'; Name='QR-Bruecke'; Version='1.0'; File='QR-Bruecke.exe'; Description='Webadressen lokal als QR-Code anzeigen.'},
    @{Id='Molitor.DisplayFit'; Name='DisplayFit'; Version='1.0'; File='DisplayFit.exe'; Description='Smartphone-Hintergrundbilder lokal erstellen.'}
)
foreach ($app in $apps) {
    $file = Join-Path $ArtifactDirectory $app.File
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing artifact: $file" }
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $url = $ReleaseBaseUrl.TrimEnd('/') + '/' + $app.File
    $lines = @(
        'PackageIdentifier: ' + $app.Id
        'PackageVersion: ' + (Quote-Yaml $app.Version)
        'PackageLocale: de-DE'
        'Publisher: Marcel Molitor'
        'PackageName: ' + (Quote-Yaml $app.Name)
        'License: ' + (Quote-Yaml $License)
        'LicenseUrl: ' + (Quote-Yaml $LicenseUrl)
        'ShortDescription: ' + (Quote-Yaml $app.Description)
        'PackageUrl: https://marcelmolitor.github.io/'
        'Installers:'
        '- Architecture: x64'
        '  InstallerType: portable'
        '  InstallerUrl: ' + (Quote-Yaml $url)
        '  InstallerSha256: ' + $hash
    )
    if ($app.Dependency) {
        $lines += @('  Dependencies:', '    PackageDependencies:', '    - PackageIdentifier: Genymobile.scrcpy')
    }
    $lines += @('ManifestType: singleton','ManifestVersion: 1.6.0')
    $dir = Join-Path $OutputDirectory $app.Id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $manifest = Join-Path $dir ($app.Id + '.yaml')
    Set-Content -LiteralPath $manifest -Value $lines -Encoding utf8
    Write-Host "Candidate: $manifest"
}
Write-Host 'Verify remote artifact hashes, current schema, locale requirements and actual installation before submitting.'
