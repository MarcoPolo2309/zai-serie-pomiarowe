import { EventEmitter } from 'node:events';

/** Prosta szyna zdarzeń w pamięci procesu: nowe wyniki → klienci SSE. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);
