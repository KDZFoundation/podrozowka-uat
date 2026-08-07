param(
  [string]$ProjectRef = 'xiqhaiyieisgemqopxfw',
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\supabase\baselines\DEV_PUBLIC_SCHEMA_FROM_REMOTE.sql')
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools\supabase-cli\supabase.exe'
$sourceConfigPath = Join-Path $repoRoot 'supabase\config.toml'
$exportWorkdir = Join-Path $repoRoot ".schema-export-$ProjectRef"
$absoluteOutputPath = [System.IO.Path]::GetFullPath($OutputPath)

if (-not (Test-Path $cliPath)) {
  throw "Supabase CLI not found: $cliPath"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $absoluteOutputPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $exportWorkdir 'supabase') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $exportWorkdir 'supabase\.temp') | Out-Null

# A temporary config lets the CLI inspect another environment without changing
# the repository's DEV-linked config.toml.
$exportConfig = Get-Content -Raw -Path $sourceConfigPath
$exportConfig = $exportConfig -replace '(?m)^project_id = ".*"$', "project_id = `"$ProjectRef`""
Set-Content -Path (Join-Path $exportWorkdir 'supabase\config.toml') -Value $exportConfig -Encoding utf8
Set-Content -Path (Join-Path $exportWorkdir 'supabase\.temp\project-ref') -Value $ProjectRef -NoNewline -Encoding ascii

# The password is prompted for only in the caller's terminal. It is never
# written to disk, added to Git, or displayed by this script.
$securePassword = Read-Host 'Enter the target database password (input is hidden)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  # auth and storage are Supabase-managed schemas. Application migrations own
  # public only; bucket configuration stays in an explicit app migration.
  & $cliPath db dump --workdir $exportWorkdir --linked --password $plainPassword --schema public --file $absoluteOutputPath --yes
  if ($LASTEXITCODE -ne 0) {
    throw "Schema dump failed with exit code $LASTEXITCODE"
  }
  Write-Output "Exported schema-only dump: $absoluteOutputPath"
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  Remove-Variable plainPassword -ErrorAction SilentlyContinue
}
