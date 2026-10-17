$ErrorActionPreference = 'Stop'
$taskManifest = Join-Path $PSScriptRoot 'native-runtime\host.json'
$taskKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.uyap.archive_ai'
if (Test-Path -LiteralPath $taskKey) {
  $taskExisting = (Get-Item -LiteralPath $taskKey).GetValue('')
  if ($taskExisting -ne $taskManifest) { throw 'Kayit bu kuruluma ait degil; degistirilmedi.' }
  Remove-Item -LiteralPath $taskKey
}
Write-Output 'Yalnizca bu kuruluma ait Chrome baglayici kaydi kaldirildi. Arsivler, AI paketleri ve is kayitlari korundu.'
