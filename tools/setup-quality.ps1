$ErrorActionPreference = 'Stop'
$taskModels = Join-Path $PSScriptRoot 'ocr-best'
New-Item -ItemType Directory -Path $taskModels -Force | Out-Null
$taskRevision = 'e12c65a915945e4c28e237a9b52bc4a8f39a0cec'
$taskHashes = @{
  tur = 'E0C3338DC17503DC7D335A507C9AE01B2B46CFD07561171E1E1AC55D85E8E438'
  eng = '8280AED0782FE27257A68EA10FE7EF324CA0F8D85BD2FD145D1C2B560BCB66BA'
}
foreach ($taskLanguage in @('tur','eng')) {
  $taskTarget = Join-Path $taskModels "$taskLanguage.traineddata"
  if (-not (Test-Path -LiteralPath $taskTarget)) {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/$taskRevision/$taskLanguage.traineddata" -OutFile $taskTarget
  }
  if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash -ne $taskHashes[$taskLanguage]) { throw "Kalite modeli hash uyusmazligi: $taskLanguage" }
}
$taskOsd = Join-Path $PSScriptRoot 'ocr-data\osd.traineddata'
if (-not (Test-Path -LiteralPath $taskOsd)) { throw 'Once setup-ai.ps1 gerekli.' }
if ((Get-FileHash -LiteralPath $taskOsd -Algorithm SHA256).Hash -ne '9CF5D576FCC47564F11265841E5CA839001E7E6F38FF7F7AACF46D15A96B00FF') { throw 'OSD model hash uyusmazligi' }
Copy-Item -LiteralPath $taskOsd -Destination (Join-Path $taskModels 'osd.traineddata') -Force
Write-Output 'Yerel yuksek kalite OCR modelleri dogrulandi. Belge aktarimi yapilmadi.'
