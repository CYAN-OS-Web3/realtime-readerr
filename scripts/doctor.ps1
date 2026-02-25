param(
  [switch]$SkipSmoke,
  [switch]$SkipDev,
  [switch]$SkipEnvCheck,
  [switch]$AutoRetryDev,
  [int]$MaxDevRestarts = 5,
  [int]$RestartDelaySeconds = 2
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

function Read-DotEnv($path) {
  $map = @{}
  if (!(Test-Path $path)) { return $map }

  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $parts = $line -split '=', 2
    if ($parts.Length -ne 2) { return }
    $k = $parts[0].Trim()
    $v = $parts[1].Trim().Trim('"').Trim("'")
    if ($k -ne '') { $map[$k] = $v }
  }
  return $map
}

function Get-EnvValue($key, $envMaps) {
  $fromProcess = [Environment]::GetEnvironmentVariable($key)
  if ($fromProcess) { return $fromProcess }

  foreach ($m in $envMaps) {
    if ($m.ContainsKey($key) -and $m[$key]) {
      return $m[$key]
    }
  }

  return $null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

Write-Step "Cyan Doctor: setup checks"
Write-Host "Repo: $repoRoot"

if ($SkipEnvCheck) {
  Write-Host "Skip local env key check (-SkipEnvCheck)." -ForegroundColor Yellow
} else {
  $rootEnv = Read-DotEnv (Join-Path $repoRoot '.env')
  $backendEnv = Read-DotEnv (Join-Path $repoRoot 'backend-vercel\\.env')
  $envMaps = @($rootEnv, $backendEnv)

  $requiredKeys = @(
    'GOOGLE_API_KEY',
    'GOOGLE_SPEECH_API_KEY',
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION',
    'ELEVENLABS_API_KEY'
  )

  $missing = @()
  foreach ($k in $requiredKeys) {
    $value = Get-EnvValue -key $k -envMaps $envMaps
    if (!$value) { $missing += $k }
  }

  if ($missing.Count -gt 0) {
    Write-Host "Missing required env keys for full 3-engine + STT:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
    Write-Host "Add them to process env, .env, or backend-vercel/.env then run again." -ForegroundColor Yellow
    Write-Host "If your keys only exist on Vercel, rerun with -SkipEnvCheck." -ForegroundColor Yellow
    exit 1
  }

  Write-Host "Env keys OK" -ForegroundColor Green
}

if (-not $SkipSmoke) {
  Write-Step "Smoke test: load backend modules"
  node -e "require('./backend-vercel/src/os/ttsRouter'); require('./backend-vercel/src/routes/tts'); require('./backend-vercel/src/routes/stt'); console.log('backend route modules loaded OK')"

  $smokeFile = Join-Path $repoRoot 'test-tts-smoke.js'
  if (Test-Path $smokeFile) {
    Write-Step "Smoke test: backend TTS endpoints"
    node $smokeFile
  } else {
    Write-Host "Skip endpoint smoke: test-tts-smoke.js not found" -ForegroundColor Yellow
  }
}

if (-not $SkipDev) {
  if ($AutoRetryDev) {
    Write-Step "Start Electron dev (auto-retry enabled)"
    $attempt = 0
    while ($true) {
      $attempt = $attempt + 1
      Write-Host "Starting dev attempt $attempt/$MaxDevRestarts" -ForegroundColor Cyan
      npm run dev
      $exitCode = $LASTEXITCODE

      if ($exitCode -eq 0) {
        Write-Host "Dev process exited normally." -ForegroundColor Green
        break
      }

      if ($exitCode -eq 130) {
        Write-Host "Dev process interrupted by user." -ForegroundColor Yellow
        break
      }

      if ($attempt -ge $MaxDevRestarts) {
        Write-Host "Dev failed after $attempt attempts. Last exit code: $exitCode" -ForegroundColor Red
        exit $exitCode
      }

      Write-Host "Dev crashed (exit $exitCode). Restarting in $RestartDelaySeconds second(s)..." -ForegroundColor Yellow
      Start-Sleep -Seconds $RestartDelaySeconds
    }
  } else {
    Write-Step "Start Electron dev"
    npm run dev
  }
} else {
  Write-Step "Done (SkipDev=true)"
}
