import {
  adminDemoListSchema,
  adminDemoDetailSchema,
  apiErrorSchema,
  createAdminDemoResponseSchema,
  createDemoSchema,
  demoIdSchema,
  demoListQuerySchema,
  demoMutationResponseSchema,
  demoPublicIdSchema,
  publicDemoDetailSchema,
  publicDemoListSchema,
  updateDemoSchema,
  type AdminDemoDetail,
  type AdminDemoList,
  type ApiFieldError,
  type CreateAdminDemoResponse,
  type CreateDemoInput,
  type DemoListQuery,
  type DemoMutationResponse,
  type PublicDemoDetail,
  type PublicDemoList,
  type UpdateDemoInput,
} from '@nest-scaffold/contracts';

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  credentials?: RequestCredentials;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly errors?: ApiFieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  if (!/^(https?:\/\/|\/(?!\/))/.test(baseUrl) || /[?#]/.test(baseUrl)) {
    throw new Error(
      'API 地址应为 HTTP(S) 地址或以 / 开头的路径，且不含查询参数',
    );
  }
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function send<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    request: RequestOptions,
    schema: { parse: (data: unknown) => T },
    payload?: unknown,
  ): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(payload === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: request.signal,
      credentials: options.credentials ?? 'omit',
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (request.signal?.aborted) throw error;
      throw new ApiError(
        '接口未返回有效 JSON',
        response.status,
        'INVALID_RESPONSE',
      );
    }
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      throw new ApiError(
        parsed.success ? parsed.data.message : `请求失败（${response.status}）`,
        response.status,
        parsed.success ? parsed.data.code : 'HTTP_ERROR',
        parsed.success ? parsed.data.errors : undefined,
      );
    }
    try {
      return schema.parse(body);
    } catch {
      throw new ApiError(
        '接口响应与约定不一致',
        response.status,
        'INVALID_RESPONSE',
      );
    }
  }

  function listPath(path: string, query: DemoListQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(
      demoListQuerySchema.parse(query),
    )) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return `${path}?${params.toString()}`;
  }

  return {
    async listAdminDemos(
      query: DemoListQuery = {},
      request: RequestOptions = {},
    ): Promise<AdminDemoList> {
      return send(
        listPath('/admin/demo/by-page', query),
        'GET',
        request,
        adminDemoListSchema,
      );
    },
    async listPublicDemos(
      query: DemoListQuery = {},
      request: RequestOptions = {},
    ): Promise<PublicDemoList> {
      return send(
        listPath('/demo/by-page', query),
        'GET',
        request,
        publicDemoListSchema,
      );
    },
    async getAdminDemo(
      id: number,
      request: RequestOptions = {},
    ): Promise<AdminDemoDetail> {
      return send(
        `/admin/demo/${demoIdSchema.parse(id)}`,
        'GET',
        request,
        adminDemoDetailSchema,
      );
    },
    async getPublicDemo(
      publicId: string,
      request: RequestOptions = {},
    ): Promise<PublicDemoDetail> {
      return send(
        `/demo/${encodeURIComponent(demoPublicIdSchema.parse(publicId))}`,
        'GET',
        request,
        publicDemoDetailSchema,
      );
    },
    async createAdminDemo(
      input: CreateDemoInput,
      request: RequestOptions = {},
    ): Promise<CreateAdminDemoResponse> {
      return send(
        '/admin/demo',
        'POST',
        request,
        createAdminDemoResponseSchema,
        createDemoSchema.parse(input),
      );
    },
    async updateAdminDemo(
      id: number,
      input: UpdateDemoInput,
      request: RequestOptions = {},
    ): Promise<DemoMutationResponse> {
      return send(
        `/admin/demo/${demoIdSchema.parse(id)}`,
        'PATCH',
        request,
        demoMutationResponseSchema,
        updateDemoSchema.parse(input),
      );
    },
    async deleteAdminDemo(
      id: number,
      request: RequestOptions = {},
    ): Promise<DemoMutationResponse> {
      return send(
        `/admin/demo/${demoIdSchema.parse(id)}`,
        'DELETE',
        request,
        demoMutationResponseSchema,
      );
    },
  };
}
