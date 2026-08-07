param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\supabase\baselines\DEV_SCHEMA_CANDIDATE.sql')
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$migrationsPath = Join-Path $repoRoot 'supabase\migrations'

# The earlier consolidated baseline is deliberately excluded.  The 2026-08-04
# snapshot is the only starting point; every file below is then applied once.
# Country data is a separate, idempotent seed and is deliberately not schema.
$migrationFiles = @(
  '20260804155100_reconciled_baseline_snapshot.sql',
  '20260804155900_add_registered_country_to_recipient_registrations.sql',
  '20260805031500_card_creator_and_language_templates.sql',
  '20260805040000_fix_create_order_16_params.sql',
  '20260806020000_add_fiscal_document_columns_to_orders.sql',
  '20260806040000_add_inpost_columns_to_shipments.sql',
  '20260806060000_cascade_card_designs_deletion.sql',
  '20260806190000_pod_orders_without_inventory.sql',
  '20260806220000_prepare_pod_qr_after_payment.sql',
  '20260807090000_protect_countries_used_by_designs.sql',
  '20260807100000_add_country_flag_url.sql'
)

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$header = @"
-- DEV schema baseline candidate — generated $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
-- DO NOT place this file in supabase/migrations or deploy it yet.
-- Source of truth: DEV project xiqhaiyieisgemqopxfw.
-- Build script: scripts/build-dev-baseline.ps1.
-- Country dictionary data is deliberately excluded; use the separate seed.

"@
Set-Content -Path $OutputPath -Value $header -Encoding utf8

foreach ($migrationFile in $migrationFiles) {
  $sourcePath = Join-Path $migrationsPath $migrationFile
  if (-not (Test-Path $sourcePath)) {
    throw "Missing migration source: $migrationFile"
  }

  $content = Get-Content -Raw -Path $sourcePath

  # These two blocks repair rows that existed in DEV at the time.  A clean
  # baseline has no business rows, so retaining them would make the baseline
  # data-bearing instead of schema-only.
  if ($migrationFile -eq '20260804155100_reconciled_baseline_snapshot.sql') {
    $content = $content -replace '(?ms)^-- Populate from old columns\r?\nUPDATE public\.card_designs SET view_no = sort_order \+ 1 WHERE view_no IS NULL;\r?\nUPDATE public\.card_designs SET title = view_name WHERE title IS NULL;\r?\n\r?\n', ''
  }
  if ($migrationFile -eq '20260806190000_pod_orders_without_inventory.sql') {
    $content = $content -replace '(?ms)^-- Repair test orders.*?AND status = ''pending'';\r?\n\r?\n', ''
  }

  Add-Content -Path $OutputPath -Value "`n-- BEGIN $migrationFile`n$content`n-- END $migrationFile`n" -Encoding utf8
}

Write-Output "Generated candidate: $OutputPath"
