# Прогон тестов в headless Edge/Chrome на всех examples\*.rlib.
# Запуск из любой папки: powershell -ExecutionPolicy Bypass -File tests\run.ps1
# Код выхода 0 — все тесты прошли.
param([string]$Browser)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent

if (-not $Browser) {
  $Browser = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $Browser) { throw 'Не найден Edge или Chrome; укажите -Browser путь\к\браузеру.exe' }
}

$query = (Get-ChildItem (Join-Path $root 'examples') -Filter *.rlib | Sort-Object Name |
  ForEach-Object { 'file=' + [uri]::EscapeDataString($_.Name) }) -join '&'
$url = ([uri](Join-Path $PSScriptRoot 'index.html')).AbsoluteUri + '?' + $query

# Отдельный профиль: иначе запуск уйдёт в уже открытый браузер
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('rie-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
$out = Join-Path $tmp 'dom.html'
try {
  $p = Start-Process -FilePath $Browser -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError "$tmp\stderr.txt" -ArgumentList @(
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    "--user-data-dir=`"$tmp\profile`"", '--allow-file-access-from-files', '--virtual-time-budget=600000', '--dump-dom', "`"$url`"")
  $dom = [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

$m = [regex]::Match($dom, '<pre id="report"[^>]*>([\s\S]*?)</pre>')
if (-not $m.Success) { Write-Output $dom; throw 'В выводе браузера нет отчёта' }
$report = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
Write-Output $report
if ($report -match 'RESULT: PASS') { exit 0 } else { exit 1 }
