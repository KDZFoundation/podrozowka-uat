param(
  [string]$ProjectRef = 'nqqephusxnxzzkfulfae'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools\supabase-cli\supabase.exe'
$sourceConfigPath = Join-Path $repoRoot 'supabase\config.toml'
$sourceMigrationPath = Join-Path $repoRoot 'supabase\migrations\20260807120000_dev_public_baseline.sql'
$sourceSeedPath = Join-Path $repoRoot 'supabase\seed.sql'
$deployWorkdir = Join-Path $repoRoot ".supabase-deploy-$ProjectRef"

foreach ($requiredPath in @($cliPath, $sourceConfigPath, $sourceMigrationPath, $sourceSeedPath)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Required file not found: $requiredPath"
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\migrations') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $deployWorkdir 'supabase\.temp') | Out-Null

$deployConfig = Get-Content -Raw -Path $sourceConfigPath
$deployConfig = $deployConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $deployWorkdir 'supabase\config.toml') -Value $deployConfig -Encoding utf8
Set-Content -Path (Join-Path $deployWorkdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii
Copy-Item -LiteralPath $sourceMigrationPath -Destination (Join-Path $deployWorkdir 'supabase\migrations\20260807120000_dev_public_baseline.sql') -Force
Copy-Item -LiteralPath $sourceSeedPath -Destination (Join-Path $deployWorkdir 'supabase\seed.sql') -Force

$securePassword = Read-Host 'Enter the UAT database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  Write-Output 'Previewing UAT migration deployment...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword --include-seed --dry-run
  if ($LASTEXITCODE -ne 0) {
    throw "UAT deployment preview failed with exit code $LASTEXITCODE"
  }

  Write-Output 'Applying canonical baseline and country seed to UAT...'
  & $cliPath db push --workdir $deployWorkdir --linked --password $plainPassword --include-seed
  if ($LASTEXITCODE -ne 0) {
    throw "UAT deployment failed with exit code $LASTEXITCODE"
  }

  Write-Output 'UAT baseline deployment completed.'
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
}
