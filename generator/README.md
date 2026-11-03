# Generator danych (emulator czujnika)

Narzędzie CLI w Node.js 20+ (bez zależności). Wysyła wyniki do `POST /api/measurements` z kluczem czujnika w nagłówku `X-API-Key`. Nigdy nie zapisuje do bazy bezpośrednio.

```bash
node generator.mjs --help
# dane historyczne (48 godzinnych wyników zakończonych "teraz"):
node generator.mjs --api https://moja-app.example.com --key "$ZAI_API_KEY" --count 48 --interval 3600 --mode sine --min 0 --max 30
# wyniki bieżące co 5 s:
ZAI_API_KEY=... node generator.mjs --api https://moja-app.example.com --live --interval 5 --mode walk --min 10 --max 25
# pokaz odrzucenia (wartość poza zakresem serii):
node generator.mjs --api http://localhost:3000 --key ... --count 1 --force-value 999
```

Klucz API podaje się wyłącznie jako `--key` albo zmienna `ZAI_API_KEY` – nie jest zapisany w kodzie. Adres API można podać też zmienną `ZAI_API_URL`.
Kod wyjścia: `0` – wszystko przyjęte, `1` – były odrzucenia/błędy lub klucz nieważny, `2` – błędne parametry.

| Parametr | Znaczenie |
|---|---|
| `--api` | adres aplikacji |
| `--key` | klucz API czujnika |
| `--count` | liczba wyników (tryb `--live`: bez limitu, jeśli nie podano) |
| `--interval` | odstęp w sekundach (znaczników czasu w trybie historycznym, przerwa w `--live`) |
| `--mode` | `sine`, `random`, `walk`, `range` |
| `--min`, `--max` | zakres generowanych wartości |
| `--noise`, `--period` | szum i okres sinusa |
| `--start` | znacznik czasu pierwszego wyniku (ISO 8601); domyślnie wyniki kończą się „teraz” |
| `--live` | wysyłanie bieżących wyników |
| `--force-value` | wysyła stałą wartość (np. spoza zakresu) |
| `--dry-run` | bez wysyłania |

Odrzucony wynik (HTTP 422) jest wypisany czytelnie na stderr wraz z powodem zwróconym przez serwer.
