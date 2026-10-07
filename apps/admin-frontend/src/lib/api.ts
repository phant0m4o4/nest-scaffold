import { createApiClient } from '@nest-scaffold/api-client';
import { QueryClient } from '@tanstack/react-query';

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
});

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
