/*
  The real `server-only` package throws on import unless it is resolved under
  the react-server condition, which Vitest does not set. Aliasing it here lets
  the provider and route modules be imported in tests without weakening the
  guarantee in the actual build, where the real package is still used.
*/
export {}
