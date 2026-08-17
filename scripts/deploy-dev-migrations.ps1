param(
  [string]$ProjectRef = 'xiqhaiyieisgemqopxfw',
  [switch]$IncludeAll,
  [string]$UpToMigration,
  [string]$PoolerHost
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

if ($UpToMigration) {
  $target = $migrations | Where-Object { $_.Name -eq $UpToMigration } | Select-Object -First 1
  if (-not $target) {
    throw "Migration '$UpToMigration' was not found in $sourceMigrationDir"
  }
  $migrations = @($migrations | Where-Object { $_.Name -le $target.Name })
  Write-Output "Deploying migrations only through: $($target.Name)"
}

$deployMigrationDir = Join-Path $deployWorkdir 'supabase\migrations'
if (Test-Path $deployMigrationDir) {
  Remove-Item -LiteralPath $deployMigrationDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $deployMigrationDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\.temp') | Out-Null

$deployConfig = Get-Content -Raw -Path $sourceConfigPath
$deployConfig = $deployConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $deployWorkdir 'supabase\config.toml') -Value $deployConfig -Encoding utf8
Set-Content -Path (Join-Path $deployWorkdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii

foreach ($migration in $migrations) {
  Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $deployMigrationDir $migration.Name) -Force
}

$securePassword = Read-Host 'Enter the DEV database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  $includeAllArgs = if ($IncludeAll) { @('--include-all') } else { @() }
  if ($IncludeAll) {
    Write-Output 'Including migrations that were added before the latest remote migration.'
  }

  if ([string]::IsNullOrWhiteSpace($PoolerHost)) {
    $poolerUrlPath = Join-Path $repoRoot 'supabase\.temp\pooler-url'
    if (Test-Path $poolerUrlPath) {
      try {
        $poolerUrl = (Get-Content -LiteralPath $poolerUrlPath -Raw).Trim()
        $PoolerHost = ([Uri]$poolerUrl).Host
        Write-Output "Using DEV Session Pooler from supabase/.temp/pooler-url: $PoolerHost"
      }
      catch {
        $PoolerHost = $null
      }
    }

    if ([string]::IsNullOrWhiteSpace($PoolerHost)) {
      $PoolerHost = Read-Host 'Enter the DEV Session Pooler host (Dashboard > Connect > Session pooler; host only)'
    }
  }

  if ($PoolerHost -notmatch '^[a-z0-9.-]+\.pooler\.supabase\.com$') {
    throw 'Invalid Session Pooler host. Paste only the host ending with .pooler.supabase.com (without protocol, user, password, port, or path).'
  }

  # Use the IPv4 Session Pooler. The direct database host is IPv6-only on
  # this network, while a pooler connection works without Supabase link/API.
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $databaseUrl = "postgresql://postgres.${ProjectRef}:$encodedPassword@$PoolerHost`:5432/postgres"
  Write-Output "Using DEV Session Pooler over IPv4: $PoolerHost"

  Write-Output 'Previewing DEV migrations...'
  & $cliPath db push --workdir $deployWorkdir --db-url $databaseUrl --dry-run $includeAllArgs
  if ($LASTEXITCODE -ne 0) {
    throw "DEV migration preview failed with exit code $LASTEXITCODE"
  }

  Write-Output 'Applying pending migrations to DEV...'
  & $cliPath db push --workdir $deployWorkdir --db-url $databaseUrl $includeAllArgs
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
  Remove-Variable encodedPassword -ErrorAction SilentlyContinue
  Remove-Variable databaseUrl -ErrorAction SilentlyContinue
}
