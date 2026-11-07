# Serie pomiarowe – ZAI 26Z

Aplikacja do zbierania i prezentacji wyników pomiarów z czujników IoT (monitoring środowiska w Warszawie).

- `backend/` – REST API (Node.js 22, TypeScript, Fastify, PostgreSQL, czysty parametryzowany SQL); testy Vitest w `backend/test/`
- `frontend/` – SPA (React, TypeScript, Vite, Recharts, własny CSS)
- `db/migrations/` – schemat bazy (SQL); diagram ERD: `docs/erd.md`
- `generator/` – emulator czujnika (CLI), opis w `generator/README.md`
- `scripts/seed.mjs` – dane przykładowe wprowadzane przez API; `scripts/make-submission-zip.sh` – archiwum do zgłoszenia
- `Dockerfile`, `render.yaml` – wdrożenie (jeden obraz: API + zbudowany frontend)
- `.github/workflows/ci.yml` – typecheck, testy backendu (Postgres) i build frontendu

## Uruchomienie lokalne

```bash
docker compose up -d db                      # PostgreSQL na porcie 55432
(cd frontend && npm ci && npm run build)
cd backend && npm ci
FRONTEND_DIR=../frontend/dist ADMIN_USERNAME=admin ADMIN_PASSWORD=admin npm run dev   # http://localhost:3000
node ../scripts/seed.mjs --api http://localhost:3000 --user admin --pass admin
```

Rozwój interfejsu: `cd frontend && npm run dev` (proxy `/api` na port 3000).
Testy backendu: `docker compose exec db createdb -U zai zai_test` (raz), `cd backend && npm test`.
Zmienne środowiskowe: patrz `.env.example`.
