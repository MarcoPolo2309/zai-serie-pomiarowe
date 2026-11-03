-- Schemat bazy: aplikacja „Serie pomiarowe” (PostgreSQL 14+)

CREATE TABLE admins (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,            -- Argon2id (z solą i parametrami)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Sesje administratora: w bazie tylko skrót SHA-256 tokenu
CREATE TABLE sessions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash  CHAR(64)    NOT NULL UNIQUE,
    admin_id    INTEGER     NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_admin_idx   ON sessions (admin_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE series (
    id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(100)     NOT NULL CHECK (char_length(btrim(name)) > 0),
    min_value  DOUBLE PRECISION NOT NULL,
    max_value  DOUBLE PRECISION NOT NULL,
    color      CHAR(7)          NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    icon       VARCHAR(50),
    unit       VARCHAR(20),
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT series_range_chk CHECK (min_value < max_value)
);

-- Czujnik należy do serii; usunięcie serii usuwa jej czujniki.
-- Klucz API przechowywany wyłącznie jako skrót SHA-256 (hex, 64 znaki).
CREATE TABLE sensors (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         VARCHAR(100) NOT NULL CHECK (char_length(btrim(name)) > 0),
    series_id    INTEGER      NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    api_key_hash CHAR(64)     NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX sensors_series_idx ON sensors (series_id);

-- Wyniki znikają razem z serią; wyrejestrowanie czujnika zostawia wyniki (sensor_id = NULL).
CREATE TABLE measurements (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    series_id INTEGER          NOT NULL REFERENCES series(id)  ON DELETE CASCADE,
    sensor_id INTEGER                   REFERENCES sensors(id) ON DELETE SET NULL,
    value     DOUBLE PRECISION NOT NULL,
    ts        TIMESTAMPTZ      NOT NULL
);
CREATE INDEX measurements_series_ts_idx ON measurements (series_id, ts);
CREATE INDEX measurements_sensor_idx    ON measurements (sensor_id, ts);

-- Log odrzuconych wyników (F4)
CREATE TABLE rejected_measurements (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    series_id  INTEGER          NOT NULL REFERENCES series(id)  ON DELETE CASCADE,
    sensor_id  INTEGER                   REFERENCES sensors(id) ON DELETE SET NULL,
    value      DOUBLE PRECISION NOT NULL,
    ts         TIMESTAMPTZ,
    reason     VARCHAR(40)      NOT NULL,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX rejected_created_idx ON rejected_measurements (created_at DESC);
