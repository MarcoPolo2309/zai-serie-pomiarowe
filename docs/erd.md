# Diagram ERD

```mermaid
erDiagram
    admins ||--o{ sessions : "ma"
    series ||--o{ sensors : "ma"
    series ||--o{ measurements : "zawiera"
    series ||--o{ rejected_measurements : "dotyczy"
    sensors ||--o{ measurements : "przesyła"
    sensors |o--o{ rejected_measurements : "przesyła"

    admins {
        int id PK
        varchar username UK
        text password_hash "Argon2id"
        timestamptz created_at
    }
    sessions {
        bigint id PK
        char64 token_hash UK "SHA-256 tokenu"
        int admin_id FK "ON DELETE CASCADE"
        timestamptz created_at
        timestamptz expires_at
    }
    series {
        int id PK
        varchar name
        double min_value "CHECK min < max"
        double max_value
        char7 color "CHECK #RRGGBB"
        varchar icon
        varchar unit
        timestamptz created_at
    }
    sensors {
        int id PK
        varchar name
        int series_id FK "ON DELETE CASCADE"
        char64 api_key_hash UK "SHA-256 klucza"
        timestamptz created_at
    }
    measurements {
        bigint id PK
        int series_id FK "ON DELETE CASCADE"
        int sensor_id FK "ON DELETE SET NULL"
        double value
        timestamptz ts "indeks (series_id, ts)"
    }
    rejected_measurements {
        bigint id PK
        int series_id FK "ON DELETE CASCADE"
        int sensor_id FK "ON DELETE SET NULL"
        double value
        timestamptz ts
        varchar reason
        timestamptz created_at
    }
```

## Opis tabel

- `admins` – konta administratorów; hasło tylko jako skrót Argon2id.
- `sessions` – ważne tokeny Bearer (1 h); w bazie wyłącznie skrót SHA-256 tokenu.
- `series` – konfiguracja serii: nazwa, przedział `min_value`..`max_value` (ograniczenie `CHECK min < max`), kolor, znacznik, jednostka.
- `sensors` – czujnik przypisany do jednej serii; klucz API tylko jako skrót SHA-256. Usunięcie serii usuwa jej czujniki.
- `measurements` – wyniki. Usunięcie serii usuwa wyniki (`CASCADE`); wyrejestrowanie czujnika zostawia je (`sensor_id = NULL`). Indeks `(series_id, ts)` przyspiesza zapytania po serii i czasie.
- `rejected_measurements` – log odrzuconych wyników (wartość spoza przedziału, czas z przyszłości), wyświetlany w panelu administratora.
