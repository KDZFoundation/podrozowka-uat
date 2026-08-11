param(
  [string]$ProjectRef = 'xiqhaiyieisgemqopxfw'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools\supabase-cli\supabase.exe'
$configPath = Join-Path $repoRoot 'supabase\config.toml'

foreach ($requiredPath in @($cliPath, $configPath)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Required file not found: $requiredPath"
  }
}

# The token is used only for this PowerShell process and is never saved to disk.
$secureToken = Read-Host 'Enter a temporary Supabase personal access token for DEV (input is hidden)' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  $plainToken = [System.Text.RegularExpressions.Regex]::Replace($plainToken, '[^\x21-\x7E]', '').Trim()

  if ($plainToken -notmatch '^sbp_[A-Za-z0-9_-]{20,}$') {
    throw 'The supplied token is not a valid Supabase personal access token format. Copy the full value that starts with sbp_.'
  }

  $env:SUPABASE_ACCESS_TOKEN = $plainToken
  Write-Output 'Deploying DEV Edge Function: create-payment (JWT verification disabled)...'
  & $cliPath functions deploy create-payment --project-ref $ProjectRef --no-verify-jwt

  if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed for create-payment with exit code $LASTEXITCODE"
  }

  Write-Output 'DEV create-payment deployment completed.'
}
finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable plainToken -ErrorAction SilentlyContinue
}
