import { Buffer } from 'buffer';
const globals = globalThis as typeof globalThis & { Buffer?: typeof Buffer; global?: typeof globalThis };
globals.Buffer ??= Buffer;
globals.global ??= globalThis;
