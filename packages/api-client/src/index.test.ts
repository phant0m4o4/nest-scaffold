import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index';

const list = {
  statusCode: 200,
  data: [],
  meta: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  },
};

describe('共享请求客户端', () => {
  it('保留代理前缀并正确编码筛选条件，透传取消信号', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(list));
    const client = createApiClient({ baseUrl: '/api/', fetch: fetcher });
    const controller = new AbortController();
    await expect(
      client.listPublicDemos(
        { name: '测试 & example', page: 1 },
        { signal: controller.signal },
      ),
    ).resolves.toEqual(list);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      '/api/demo/by-page?page=1&name=%E6%B5%8B%E8%AF%95+%26+example',
    );
    expect(options).toMatchObject({
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
    });
  });

  it('管理端调用独立路由，按应用设置凭据策略', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(list));
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetcher,
      credentials: 'include',
    });
    await client.listAdminDemos({ pageSize: 20 });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/admin/demo/by-page?pageSize=20',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('错误信封转换为可识别的状态码和业务错误', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { statusCode: 403, code: 'FORBIDDEN', message: '无访问权限' },
          { status: 403 },
        ),
      );
    await expect(
      createApiClient({ baseUrl: '/api', fetch: fetcher }).listAdminDemos(),
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: '无访问权限',
    });
  });

  it.each([
    Response.json({ unexpected: true }),
    new Response('<html>proxy error</html>', { status: 502 }),
  ])('拒绝不符合接口契约的响应', async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      createApiClient({ baseUrl: '/api', fetch: fetcher }).listPublicDemos(),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('非法分页在发送请求前失败', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createApiClient({ baseUrl: '/api', fetch: fetcher }).listPublicDemos({
        page: -1,
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('保留原始取消错误，供 Query 正确终止请求', async () => {
    const error = new DOMException('请求取消', 'AbortError');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(
      createApiClient({ baseUrl: '/api', fetch: fetcher }).listPublicDemos(),
    ).rejects.toBe(error);
  });

  it('管理员新增以 JSON 提交规范化字段，返回创建后的 id', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ statusCode: 201, data: { id: 12 } }, { status: 201 }),
      );
    const signal = new AbortController().signal;
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(
      client.createAdminDemo(
        { name: '  新示例  ', type: 'TYPE_2', parentId: null },
        { signal },
      ),
    ).resolves.toEqual({ statusCode: 201, data: { id: 12 } });
    expect(fetcher).toHaveBeenCalledWith('/api/admin/demo', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '新示例', type: 'TYPE_2', parentId: null }),
      credentials: 'omit',
      signal,
    });
  });

  it('PATCH 仅发送变更字段并支持清空父级，DELETE 没有请求体', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ statusCode: 200 })),
      );
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(
      client.updateAdminDemo(12, { parentId: null }),
    ).resolves.toEqual({ statusCode: 200 });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/admin/demo/12',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"parentId":null}',
      }),
    );
    await expect(client.deleteAdminDemo(12)).resolves.toEqual({
      statusCode: 200,
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/admin/demo/12',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetcher.mock.calls[1][1]).not.toHaveProperty('body');
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('详情使用各自标识并编码公开路径，保留空结果', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ statusCode: 200, data: null })),
      );
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(client.getAdminDemo(12)).resolves.toEqual({
      statusCode: 200,
      data: null,
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/admin/demo/12',
      expect.objectContaining({ method: 'GET' }),
    );
    await expect(client.getPublicDemo('a/b?x=1')).resolves.toEqual({
      statusCode: 200,
      data: null,
    });
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/demo/a%2Fb%3Fx%3D1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('写入失败保留服务端字段错误和约束参数，供表单展示', async () => {
    const errors = [
      {
        field: 'name',
        code: 'too_big',
        message: '名称最多 100 个字符',
        params: { maximum: 100 },
      },
    ];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          statusCode: 422,
          code: 'VALIDATION_FAILED',
          message: '参数校验失败',
          errors,
        },
        { status: 422 },
      ),
    );
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(
      client.createAdminDemo({ name: '示例', type: 'TYPE_1' }),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', errors });
  });

  it('非法写入和路径参数不发送请求', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(
      client.createAdminDemo({ name: '  ', type: 'TYPE_1' }),
    ).rejects.toThrow();
    await expect(client.updateAdminDemo(1, {})).rejects.toThrow();
    await expect(client.updateAdminDemo(1, { parentId: -1 })).rejects.toThrow();
    await expect(client.deleteAdminDemo(0)).rejects.toThrow();
    await expect(
      client.getAdminDemo(Number.MAX_SAFE_INTEGER + 1),
    ).rejects.toThrow();
    await expect(client.getPublicDemo('')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('列表排序参数通过校验后发送给服务端', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(list));
    await createApiClient({ baseUrl: '/api', fetch: fetcher }).listAdminDemos({
      orderColumn: 'name',
      orderDirection: 'asc',
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/demo/by-page?orderColumn=name&orderDirection=asc',
      expect.anything(),
    );
  });

  it('拒绝状态成功但缺少创建标识或详情内容的响应', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ statusCode: 200 })),
      );
    const client = createApiClient({ baseUrl: '/api', fetch: fetcher });
    await expect(
      client.createAdminDemo({ name: '示例', type: 'TYPE_1' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.getAdminDemo(1)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
