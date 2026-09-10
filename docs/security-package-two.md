# Pakiet gotowości środowisk i POD 2 — UAT

Zakres audytu: A05, A06, A09 oraz aktualizacja procedur operacyjnych z A15.

## Co zmienia kod

- Backend uruchamiany na Vercel wymaga jawnego `GCP_PROJECT_ID` i
  `FIRESTORE_DATABASE_ID`. Brak jednej z tych wartości kończy żądanie błędem
  konfiguracji, zamiast kierować je ukrytym domyślnym projektem UAT.
- Weryfikacja tokenów Firebase korzysta z jawnego projektu Auth lub — gdy nie
  jest ustawiony osobno — z jawnego projektu GCP. Nie ma bezwarunkowego
  fallbacku wdrożeniowego.
- Produkcyjny build klienta wymaga pełnego zestawu `VITE_FIREBASE_*` albo
  przerywa build. Częściowy zestaw jest również błędem; zapobiega to połączeniu
  projektu PROD z pojedynczymi polami konfiguracji UAT.
- Workflow UAT waliduje cel wdrożenia, ustawia `VITE_APP_ENV=uat` i wdraża
  przez `firebase.uat.json`. `.firebaserc` nie ustawia już domyślnego projektu.
- Walidator kontroluje wymagany indeks numeracji POD:
  `inventory_units(card_design_id ASC, inventory_serial_no DESC)`.

## Stan konfiguracji UAT

Odczyt nazw zmiennych Vercel UAT potwierdził obecność `GCP_PROJECT_ID`,
`FIRESTORE_DATABASE_ID`, kompletu WIF oraz wymaganych nazw konfiguracji POD.
Wartości sekretów nie były odczytywane ani zmieniane.

## Celowo poza zakresem

- Nie utworzono ani nie wdrożono konfiguracji PROD.
- Nie ustawiono hashy szablonów/fontów, nie zmieniono bucketów, indeksów w
  działającej bazie ani danych katalogowych. Te operacje wymagają zatwierdzonych
  plików binarnych, wskazania środowiska oraz osobnego potwierdzenia.
- Nie włączono sprzedaży, HotPay, InPost ani procesu wydania do drukarni.

## Weryfikacja lokalna

- `validate:deployment-config`: PASS.
- TypeScript backendu: PASS.
- Vitest: 52 pliki / 289 testów PASS; 10 testów integracyjnych emulatora
  pominiętych w zwykłym przebiegu.
- ESLint: 0 błędów, 12 wcześniejszych ostrzeżeń.
- Build UAT i `git diff --check`: PASS.

Publikacja, wdrożenie UAT oraz późniejsze przeniesienie do PROD pozostają
osobnymi etapami.
