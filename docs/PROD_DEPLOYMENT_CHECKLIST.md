# Lista wydania PROD — Podróżówka

Status: obowiązujące, przedpremierowe. Aktualizacja: 2026-09-10.

PROD działa na osobnym projekcie Firebase `podrozowka-production` oraz
repozytorium `KDZFoundation/podrozowka-prod`. UAT jest miejscem implementacji i
akceptacji zmian. Nie kopiujemy bazy UAT, sekretów ani danych katalogowych
automatycznie do PROD.

## Bramka przed wydaniem

- [ ] Zmiana jest scalona i zaakceptowana na UAT wraz z zielonym Quality Gate.
- [ ] Wydanie ma zatwierdzony zakres oraz plan rollbacku.
- [ ] W repo PROD istnieje jawna konfiguracja Firebase dla
  `podrozowka-production`, bazy `(default)` i właściwego Hosting site;
  `firebase.prod.example.json` nie jest plikiem wdrożeniowym.
- [ ] Backend Vercel PROD ma komplet: `GCP_PROJECT_ID=podrozowka-production`,
  `FIRESTORE_DATABASE_ID=(default)`, `FIREBASE_AUTH_PROJECT_ID`, dane WIF,
  `FRONTEND_ORIGIN`, `PUBLIC_APP_URL` i `CHECKOUT_RETURN_ORIGIN` dla
  `https://podrozowka.pl`.
- [ ] Produkcyjny build zawiera kompletny zestaw `VITE_FIREBASE_*`; nie używa
  konfiguracji ani flag UAT.
- [ ] `SALES_ENABLED=false` i osłona przedpremierowa pozostają aktywne, chyba
  że właściciel jawnie zatwierdzi otwarcie sprzedaży.

## Firestore i POD

- [ ] Wdrożyć reguły oraz indeks `inventory_units(card_design_id ASC,
  inventory_serial_no DESC)` do bazy `(default)` i zaczekać na READY.
- [ ] Uzupełnić wyłącznie zatwierdzone aktywne wzory o `print_format_id`; nie
  aktywować automatycznie pozostałych wzorów.
- [ ] Ustawić zatwierdzone URL-e, allowlisty i dokładne SHA-256 szablonów oraz
  fontów POD.
- [ ] Wykonać test PDF na UAT, potem fizyczną próbę SRA3 i ręczny approval
  operatora. To nie jest etap automatyczny.

## Odzyskiwanie i operacje

- [ ] Ustalić RPO/RTO, skonfigurować backup/PITR Firestore oraz ochronę przed
  usunięciem, a następnie przeprowadzić próbę odtworzenia do odrębnego celu.
- [ ] Skonfigurować monitoring błędów, alerty kosztów i procedurę rollbacku.
- [ ] HotPay oraz InPost przełączyć na tryb produkcyjny dopiero po publicznej
  domenie, webhookach i kontrolowanym teście całego przepływu.

## Po wdrożeniu

- [ ] Smoke test: strona, katalog, logowanie i panel administratora.
- [ ] Po otwarciu sprzedaży: jedno kontrolowane zamówienie → HotPay webhook →
  sztuki/QR → PDF → etykieta dostawy → rejestracja QR.
- [ ] Potwierdzić logi Vercel/Firebase oraz stan indeksów. Nie używać starych
  instrukcji Supabase, Edge Functions lub Przelewy24 jako procedury wydania.
