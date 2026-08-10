#!/usr/bin/env bash
set -euo pipefail

UAT_URL="https://podrozowka-uat-one.vercel.app"
SUPABASE_UAT_URL="https://nqqephusxnxzzkfulfae.supabase.co"

echo "=========================================="
echo "UAT Smoke Tests - Starting..."
echo "=========================================="

PASSED=0
FAILED=0
RESULTS=()

check_endpoint() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  
  local status_code
  if [ "$method" == "OPTIONS" ]; then
    status_code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$url" \
      -H "Origin: $UAT_URL" \
      -H "Access-Control-Request-Method: POST")
  else
    status_code=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$url")
  fi

  if [ "$status_code" -eq 200 ] || [ "$status_code" -eq 204 ]; then
    PASSED=$((PASSED + 1))
    RESULTS+=("✅ PASS | $name ($status_code)")
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("❌ FAIL | $name ($status_code)")
  fi
}

echo "Testing Frontend Routes..."
check_endpoint "Frontend /" "$UAT_URL/"
check_endpoint "Frontend /sklep" "$UAT_URL/sklep"
check_endpoint "Frontend /koszyk" "$UAT_URL/koszyk"
check_endpoint "Frontend /checkout" "$UAT_URL/checkout"
check_endpoint "Frontend /auth" "$UAT_URL/auth"

echo "Testing Edge Functions (OPTIONS preflight)..."
# List of all 10 edge functions
EDGE_FUNCTIONS=(
  "register-postcard"
  "generate-qr"
  "generate-qr-pdf"
  "p24-webhook"
  "issue-fiscal-document"
  "fiscal-document-pdf"
  "create-payment"
  "confirm-cod-payment"
  "create-inpost-shipment"
  "admin-payment-status"
)

for fn in "${EDGE_FUNCTIONS[@]}"; do
  check_endpoint "Function: $fn" "$SUPABASE_UAT_URL/functions/v1/$fn" "OPTIONS"
done

echo "=========================================="
echo "Results Summary:"
echo "=========================================="
for result in "${RESULTS[@]}"; do
  echo "$result"
done

echo "------------------------------------------"
echo "Total Passed: $PASSED"
echo "Total Failed: $FAILED"
echo "=========================================="

if [ "$FAILED" -gt 0 ]; then
  echo "Smoke tests failed. Please check the logs above."
  exit 1
else
  echo "Smoke tests passed successfully!"
  exit 0
fi
