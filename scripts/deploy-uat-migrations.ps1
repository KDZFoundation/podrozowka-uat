param(
  [string]$ProjectRef = 'nqqephusxnxzzkfulfae'
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

# UAT already has the canonical baseline. It must still be present in this
# temporary migration directory so Supabase CLI can validate remote migration
# history; db push skips it because it is already recorded remotely. We do not
# copy a seed file, therefore this release never reseeds UAT.
$migrationNames = Get-ChildItem -LiteralPath $sourceMigrationDir -File -Filter '*.sql' |
  Sort-Object Name

if ($migrationNames.Count -eq 0) {
  throw 'No migrations were found.'
}

New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\migrations') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\.temp') | Out-Null

$deployConfig = Get-Content -Raw -Path $sourceConfigPath
$deployConfig = $deployConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $deployWorkdir 'supabase\config.toml') -Value $deployConfig -Encoding utf8
Set-Content -Path (Join-Path $deployWorkdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii

foreach ($migration in $migrationNames) {
  Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $deployWorkdir "supabase\migrations\$($migration.Name)") -Force
}

$securePassword = Read-Host 'Enter the UAT database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  Write-Output 'Previewing UAT migrations...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword --dry-run
  if ($LASTEXITCODE -ne 0) {
    throw "UAT migration preview failed with exit code $LASTEXITCODE"
  }

  Write-Output 'Applying pending migrations to UAT...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword
  if ($LASTEXITCODE -ne 0) {
    throw "UAT migration deployment failed with exit code $LASTEXITCODE"
  }

  Write-Output 'UAT migration deployment completed.'
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
}
