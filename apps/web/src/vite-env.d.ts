/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Game server origin, e.g. https://dodice.example.com. Defaults: same host, port 2567 in dev; same origin in production. */
  readonly VITE_SERVER_URL?: string;
}
