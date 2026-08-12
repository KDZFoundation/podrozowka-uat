param(
  [string]$ProjectRef = 'xiqhaiyieisgemqopxfw'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools\supabase-cli\supabase.exe'
$sourceConfigPath = Join-Path $repoRoot 'supabase\config.toml'
$sourceMigrationDir = Join-Path $repoRoot 'supabase\migrations'
$workdir = Join-Path $repoRoot ".supabase-migrations-$ProjectRef"
$canonicalBaseline = '20260807120000'
$legacyVersions = @(
  '20260121122931',
  '20260720122800',
  '20260720123500',
  '20260804155100',
  '20260804155900',
  '20260805031500',
  '20260805032500',
  '20260805040000',
  '20260806020000',
  '20260806040000',
  '20260806060000'
)

foreach ($requiredPath in @($cliPath, $sourceConfigPath, $sourceMigrationDir)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Required file not found: $requiredPath"
  }
}

Write-Output 'This operation changes only Supabase migration history for DEV.'
Write-Output 'It does not apply SQL, remove tables, or change business data.'
Write-Output "It replaces $($legacyVersions.Count) archived history entries with canonical baseline $canonicalBaseline."
$confirmation = Read-Host 'Type TAK to continue'
if ($confirmation -cne 'TAK') {
  Write-Output 'Cancelled. No changes were made.'
  exit 0
}

New-Item -ItemType Directory -Force -Path (Join-Path $workdir 'supabase\migrations') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $workdir 'supabase\.temp') | Out-Null

$deployConfig = Get-Content -Raw -Path $sourceConfigPath
$deployConfig = $deployConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $workdir 'supabase\config.toml') -Value $deployConfig -Encoding utf8
Set-Content -Path (Join-Path $workdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii

Get-ChildItem -LiteralPath $sourceMigrationDir -File -Filter '*.sql' | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $workdir "supabase\migrations\$($_.Name)") -Force
}

$securePassword = Read-Host 'Enter the DEV database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  Write-Output 'Marking archived DEV migration history as reverted...'
  & $cliPath migration repair --workdir $workdir --linked --password $plainPassword --status reverted $legacyVersions
  if ($LASTEXITCODE -ne 0) {
    throw "DEV migration-history repair failed with exit code $LASTEXITCODE"
  }

  Write-Output "Marking canonical DEV baseline $canonicalBaseline as applied..."
  & $cliPath migration repair --workdir $workdir --linked --password $plainPassword --status applied $canonicalBaseline
  if ($LASTEXITCODE -ne 0) {
    throw "DEV baseline history update failed with exit code $LASTEXITCODE"
  }

  Write-Output 'DEV migration history reconciliation completed.'
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
}
