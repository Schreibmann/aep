/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AEP_API_BASE?: string;
  readonly VITE_AEP_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
