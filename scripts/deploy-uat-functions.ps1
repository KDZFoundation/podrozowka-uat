param(
  [string]$ProjectRef = 'nqqephusxnxzzkfulfae'
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

# The token is used only for this PowerShell process. It is never written to a file.
$secureToken = Read-Host 'Enter a temporary Supabase personal access token for UAT (input is hidden)' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  # Copying from a browser can occasionally add an invisible line-break or
  # Unicode formatting character. Keep only printable token characters.
  $plainToken = [System.Text.RegularExpressions.Regex]::Replace($plainToken, '[^\x21-\x7E]', '').Trim()
  if ($plainToken -notmatch '^sbp_[A-Za-z0-9_-]{20,}$') {
    throw 'The supplied token is not a valid Supabase personal access token format. Copy the full value that starts with sbp_.'
  }

  $env:SUPABASE_ACCESS_TOKEN = $plainToken
  Write-Output "Using a validated Supabase personal access token (length: $($plainToken.Length))."

  $functionsWithoutJwt = @(
    'register-postcard',
    'generate-qr',
    'generate-qr-pdf',
    'p24-webhook',
    'issue-fiscal-document',
    'fiscal-document-pdf',
    'create-payment'
  )

  $functionsWithJwt = @(
    'confirm-cod-payment',
    'create-inpost-shipment',
    'admin-payment-status'
  )

  foreach ($functionName in $functionsWithoutJwt) {
    Write-Output "Deploying UAT Edge Function: $functionName (JWT verification disabled)..."
    & $cliPath functions deploy $functionName --project-ref $ProjectRef --no-verify-jwt
    if ($LASTEXITCODE -ne 0) {
      throw "Deployment failed for $functionName with exit code $LASTEXITCODE"
    }
  }

  foreach ($functionName in $functionsWithJwt) {
    Write-Output "Deploying UAT Edge Function: $functionName..."
    & $cliPath functions deploy $functionName --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
      throw "Deployment failed for $functionName with exit code $LASTEXITCODE"
    }
  }

  Write-Output 'UAT Edge Functions deployment completed.'
}
finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable plainToken -ErrorAction SilentlyContinue
}
