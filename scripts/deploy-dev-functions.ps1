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

  foreach ($functionName in @('p24-webhook', 'hotpay-webhook', 'create-payment')) {
    Write-Output "Deploying DEV Edge Function: $functionName (JWT verification disabled)..."
    & $cliPath functions deploy $functionName --project-ref $ProjectRef --no-verify-jwt
    if ($LASTEXITCODE -ne 0) {
      throw "Deployment failed for $functionName with exit code $LASTEXITCODE"
    }
  }

  Write-Output 'Deploying DEV Edge Function: admin-payment-status...'
  & $cliPath functions deploy admin-payment-status --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed for admin-payment-status with exit code $LASTEXITCODE"
  }

  Write-Output 'DEV payment Edge Functions deployment completed.'
}
finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable plainToken -ErrorAction SilentlyContinue
}
