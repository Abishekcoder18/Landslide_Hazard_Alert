import { createHttpApi } from './httpApi';
import { createMockApi } from './mock/mockApi';
import { ResilionApi } from './types';

const baseUrl = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL;

/** Set VITE_API_URL to use the FastAPI backend; otherwise the in-browser sample-data server is used. */
export const api: ResilionApi = baseUrl ? createHttpApi(baseUrl) : createMockApi();
export * from './types';
