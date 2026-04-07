/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_SALES_COMPANY?: string;
  readonly VITE_DEFAULT_SALES_NAME?: string;
  readonly VITE_DEFAULT_SALES_TEL?: string;
  readonly VITE_DEFAULT_SURVEYOR_COMPANY?: string;
  readonly VITE_DEFAULT_SURVEYOR_NAME?: string;
  readonly VITE_DEFAULT_SURVEYOR_TEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
