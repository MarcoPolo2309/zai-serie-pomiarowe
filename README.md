# Serie pomiarowe – ZAI 26Z

Aplikacja do zbierania i prezentacji wyników pomiarów z czujników IoT (monitoring środowiska w Warszawie).

- `backend/` – REST API (Node.js 22, TypeScript, Fastify, PostgreSQL, czysty parametryzowany SQL)
- `db/migrations/` – schemat bazy (SQL)
- `generator/` – emulator czujnika (CLI), opis w `generator/README.md`
- `scripts/seed.mjs` – dane przykładowe wprowadzane przez API
- `Dockerfile`, `render.yaml` – wdrożenie

## Uruchomienie lokalne (API)

```bash
docker compose up -d db                      # PostgreSQL na porcie 55432
cd backend && npm install
ADMIN_USERNAME=admin ADMIN_PASSWORD=admin npm run dev    # http://localhost:3000 (migracje i konto admina powstają przy starcie)
node ../scripts/seed.mjs --api http://localhost:3000 --user admin --pass admin
```

Zmienne środowiskowe: patrz `.env.example`.
