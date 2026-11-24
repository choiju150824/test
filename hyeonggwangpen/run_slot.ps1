# 형광펜뉴스 회차 실행기 (작업 스케줄러가 호출)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$logDir = Join-Path $root "runs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$log = Join-Path $logDir "$stamp.log"

# 같은 시각에 이미 돌고 있으면 중단
$lock = Join-Path $root "run.lock"
if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalMinutes -lt 60) { "[$stamp] 다른 실행이 진행 중이라 건너뜀" | Out-File $log -Encoding utf8; exit 0 }
}
New-Item -ItemType File -Force $lock | Out-Null

try {
    $prompt = Get-Content (Join-Path $root "run_prompt.md") -Raw -Encoding UTF8
    $claude = Join-Path $env:USERPROFILE ".local\bin\claude.exe"
    if (-not (Test-Path $claude)) { $claude = "claude" }
    $allowed = @(
        "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent",
        "Bash(python *)", "Bash(curl *)", "Bash(git *)", "Bash(ls *)", "Bash(cat *)", "Bash(mkdir *)"
    )
    "[$stamp] 시작" | Out-File $log -Encoding utf8
    & $claude -p $prompt --allowedTools $allowed --permission-mode acceptEdits 2>&1 | Out-File $log -Append -Encoding utf8
    "[$(Get-Date -Format 'yyyyMMdd-HHmm')] 종료 (exit $LASTEXITCODE)" | Out-File $log -Append -Encoding utf8
}
finally {
    Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
