const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Brak wymaganej zmiennej środowiskowej ${name}`);
  return v;
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 3000),
  databaseUrl: isProd ? required('DATABASE_URL') : (env.DATABASE_URL ?? 'postgres://zai:zai@localhost:55432/zai'),
  adminUsername: env.ADMIN_USERNAME ?? 'admin',
  adminPassword: env.ADMIN_PASSWORD, // używane tylko do utworzenia konta, gdy go jeszcze nie ma
  sessionTtlSeconds: Number(env.SESSION_TTL_SECONDS ?? 3600),
  frontendDir: env.FRONTEND_DIR, // opcjonalnie: katalog ze zbudowanym SPA
  runMigrations: env.RUN_MIGRATIONS !== 'false',
  forceHttps: env.FORCE_HTTPS ? env.FORCE_HTTPS === 'true' : isProd,
  logLevel: env.LOG_LEVEL ?? 'info',
};
