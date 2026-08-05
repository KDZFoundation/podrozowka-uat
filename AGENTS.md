# Zasady projektowe i wytyczne postępowania

## 1. Obsługa migracji SQL i stanów bazy danych

Dla każdej zmiany, która wymaga migracji SQL (nowa kolumna, tabela, funkcja, polityka RLS, trigger):

1. **Rozróżnienie stanów:**
   - **Stan 1: Kod zapisany w repozytorium** — plik `.sql` został utworzony w folderze migracji, kod aplikacji zaktualizowany.
   - **Stan 2: Zmiana zastosowana i zweryfikowana na żywej bazie** — migracja fizycznie została wykonana na instancji bazy danych.

2. **Zakaz przedwczesnych deklaracji:**
   - Po samym utworzeniu/zapisaniu pliku migracji `.sql` **NIGDY** nie określaj zmiany jako "wdrożonej", "działającej" ani "przetestowanej na żywej bazie".

3. **Jawne wykonywanie migracji i raportowanie wyników:**
   - Próbuj zaaplikować migrację na żywej bazie (np. przy użyciu CLI Supabase `npx supabase db push` lub dedykowanych narządzi / zapytań).
   - W odpowiedzi podawaj rzeczywisty output z wykonania polecenia.

4. **Transparentność w przypadku braku możliwości wykonania:**
   - Jeśli wykonanie polecenia na bazie jest niemożliwe (np. brak połączenia CLI, brak tokena/uprawnień w środowisku container/sandbox), wyraźnie poinformuj użytkownika:
     *Status: Plik migracji został przygotowany w repozytorium, ale wymaga ręcznego zastosowania na bazie danych.*

5. **Przejrzyste podsumowanie zadań:**
   - Każde podsumowanie prac musi precyzyjnie rozdzielać stan zmian w kodzie od stanu rzeczywistym na bazie danych.
