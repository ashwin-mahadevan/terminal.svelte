// TODO: SSR depends on tree-shaking, which doesn't happen under `vite dev`.
export const ssr = process.env.NODE_ENV !== 'development';
