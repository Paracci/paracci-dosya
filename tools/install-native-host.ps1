param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [string]$ArchiveRoot
)
$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskProject '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Once setup-ai.ps1 ile yerel motoru kurun.' }
if (-not $ArchiveRoot) {
  $taskFolders = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
  $taskDownloads = [Environment]::ExpandEnvironmentVariables($taskFolders.'{374DE290-123F-4565-9164-39C4925E467B}')
  $ArchiveRoot = Join-Path $taskDownloads 'UYAP'
}
if (-not (Test-Path -LiteralPath $ArchiveRoot)) { New-Item -ItemType Directory -Path $ArchiveRoot -Force | Out-Null }
$taskArchive = (Resolve-Path -LiteralPath $ArchiveRoot).Path
$taskRuntime = Join-Path $PSScriptRoot 'native-runtime'
New-Item -ItemType Directory -Path $taskRuntime -Force | Out-Null
$taskOrigin = "chrome-extension://$ExtensionId/"
$taskManifest = Join-Path $taskRuntime 'host.json'
$taskState = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'UyapArchiveAI'
$taskConfig = @{ allowed_origins = @($taskOrigin); allowed_roots = @($taskArchive); state_root = $taskState }
$taskHost = @{ name = 'com.uyap.archive_ai'; description = 'Paracci Dosya local AI engine'; path = (Join-Path $PSScriptRoot 'native_host.cmd'); type = 'stdio'; allowed_origins = @($taskOrigin) }
$taskKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.uyap.archive_ai'
if (Test-Path -LiteralPath $taskKey) {
  $taskExisting = (Get-Item -LiteralPath $taskKey).GetValue('')
  if ($taskExisting -and $taskExisting -ne $taskManifest) { throw 'Ayni host adi baska bir kuruluma ait; kayit degistirilmedi.' }
}
$taskUtf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $taskRuntime 'config.json'), ($taskConfig | ConvertTo-Json -Depth 5), $taskUtf8)
[System.IO.File]::WriteAllText($taskManifest, ($taskHost | ConvertTo-Json -Depth 5), $taskUtf8)
New-Item -Path $taskKey -Force | Out-Null
Set-Item -LiteralPath $taskKey -Value $taskManifest
Write-Output 'Native Messaging host yalnizca bu eklenti ve UYAP arsiv kokune kaydedildi. Chrome eklentisini yeniden yukleyin.'
