param(
  [string]$ProjectRef = 'xiqhaiyieisgemqopxfw'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools\supabase-cli\supabase.exe'
$sourceConfigPath = Join-Path $repoRoot 'supabase\config.toml'
$sourceMigrationDir = Join-Path $repoRoot 'supabase\migrations'
$deployWorkdir = Join-Path $repoRoot ".supabase-migrations-$ProjectRef"

foreach ($requiredPath in @($cliPath, $sourceConfigPath, $sourceMigrationDir)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Required file not found: $requiredPath"
  }
}

$migrations = Get-ChildItem -LiteralPath $sourceMigrationDir -File -Filter '*.sql' | Sort-Object Name
if ($migrations.Count -eq 0) {
  throw 'No migrations were found.'
}

New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\migrations') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\.temp') | Out-Null

$deployConfig = Get-Content -Raw -Path $sourceConfigPath
$deployConfig = $deployConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $deployWorkdir 'supabase\config.toml') -Value $deployConfig -Encoding utf8
Set-Content -Path (Join-Path $deployWorkdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii

foreach ($migration in $migrations) {
  Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $deployWorkdir "supabase\migrations\$($migration.Name)") -Force
}

$securePassword = Read-Host 'Enter the DEV database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  Write-Output 'Previewing DEV migrations...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword --dry-run
  if ($LASTEXITCODE -ne 0) {
    throw "DEV migration preview failed with exit code $LASTEXITCODE"
  }

  Write-Output 'Applying pending migrations to DEV...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword
  if ($LASTEXITCODE -ne 0) {
    throw "DEV migration deployment failed with exit code $LASTEXITCODE"
  }

  Write-Output 'DEV migration deployment completed.'
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
}
