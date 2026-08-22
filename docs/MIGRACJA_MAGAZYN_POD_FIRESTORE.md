# Migracja magazynu i POD do Firestore

## Zasada zachowania danych

Kolekcje są przenoszone z zachowaniem dotychczasowych `id`, kodów
`internal_inventory_code`, `public_claim_code`, referencji do wzorów oraz historii.
Nie zmieniamy kodów QR i nie generujemy ich ponownie podczas migracji.

| Supabase | Firestore |
|---|---|
| `inventory_locations` | `inventory_locations` |
| `stock_production_orders` | `stock_production_orders` |
| `stock_batches` | `stock_batches` |
| `inventory_units` | `inventory_units` |
| `inventory_movements` | `inventory_movements` |
| `inventory_unit_events` | `inventory_unit_events` |
| `qr_print_jobs` | `qr_print_jobs` |
| `qr_print_job_items` | `qr_print_job_items` |
| `pod_production_batches` | `pod_production_batches` |
| `pod_production_batch_orders` | `pod_production_batch_orders` |

## Lokalny proces

```powershell
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\transform-operational-data.ts

$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
.\node_modules\.bin\tsx.cmd .\scripts\firestore-migrations\import-collection-to-emulator.ts `
  --input .\migration-data\generated\inventory_units.firestore.json
```

Import musi być wykonany w kolejności: lokalizacje → zlecenia → partie → jednostki → ruchy/zdarzenia → zadania QR → paczki POD.

## Kolejny etap funkcjonalny

Po imporcie przepisujemy operacje SQL na transakcje Firestore wykonywane przez zaufany backend Cloud Run: tworzenie partii, nadawanie kodów QR, przyjęcie zlecenia do magazynu oraz rezerwację sztuk dla opłaconego zamówienia.
