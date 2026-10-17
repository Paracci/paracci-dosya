$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskProject '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
  python -m venv (Join-Path $taskProject '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python sanal ortami olusturulamadi.' }
}
& $taskPython -m pip install -r (Join-Path $taskProject 'requirements-ai.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python bagimliliklari kurulamadi.' }
$taskModels = Join-Path $PSScriptRoot 'ocr-data'
New-Item -ItemType Directory -Path $taskModels -Force | Out-Null
$taskRevision = '87416418657359cb625c412a48b6e1d6d41c29bd'
$taskHashes = @{
  tur = '7393381111E1152420FC4092CB44EEF4237580D21B92BF30D7D221AAD192C6B7'
  eng = '7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2'
  osd = '9CF5D576FCC47564F11265841E5CA839001E7E6F38FF7F7AACF46D15A96B00FF'
}
foreach ($taskLanguage in @('tur', 'eng', 'osd')) {
  $taskTarget = Join-Path $taskModels "$taskLanguage.traineddata"
  if (-not (Test-Path -LiteralPath $taskTarget)) {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$taskRevision/$taskLanguage.traineddata" -OutFile $taskTarget
  }
  if ((Get-FileHash -LiteralPath $taskTarget -Algorithm SHA256).Hash -ne $taskHashes[$taskLanguage]) { throw "OCR modeli hash uyusmazligi: $taskLanguage" }
}
Write-Output 'Python ve Turkce/Ingilizce OCR modelleri hazir. Tesseract 5 ayrica kurulu olmalidir.'
