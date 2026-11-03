import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

/** 32 losowe bajty → 43 znaki base64url (256 bitów entropii). */
export const randomToken = () => randomBytes(32).toString('base64url');

// Parametry Argon2id zgodne z minimalną rekomendacją OWASP (19 MiB, t=2, p=1)
const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, ARGON_OPTIONS);
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password).catch(() => false);

// Stały skrót do porównania, gdy użytkownik nie istnieje (wyrównanie czasu odpowiedzi)
let dummyHash: Promise<string> | undefined;
export const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));
