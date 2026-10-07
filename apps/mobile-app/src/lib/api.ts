import { createApiClient } from '@nest-scaffold/api-client';

export const apiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000',
});
