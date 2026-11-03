# Obraz produkcyjny: backend (Node.js 22) + zbudowany frontend (jeśli istnieje katalog frontend/)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=10000
WORKDIR /app
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/package.json ./backend/
COPY db ./db
USER node
EXPOSE 10000
WORKDIR /app/backend
CMD ["node", "dist/server.js"]
