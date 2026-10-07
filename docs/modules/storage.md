# StorageModule

[模块](../../apps/server/src/common/modules/storage/storage.module.ts) · [服务](../../apps/server/src/common/modules/storage/storage.service.ts) · [类型](../../apps/server/src/common/modules/storage/storage.types.ts) · [配置](../../apps/server/src/configs/storage.config.ts)

基于 AWS SDK for JavaScript v3 的单 bucket S3 兼容存储。`StorageModule` 导出两个服务：`StorageService` 处理服务端写入、流式读取、受限内存读取、元数据查询、删除和 PUT 预签名；[UploaderService](#浏览器直传) 处理浏览器直传签发与结果核验。业务文件默认私有；应用只处理内存或数据流，不创建本地上传目录、临时文件或本地存储降级路径。

## 配置步骤

1. 准备私有 bucket。本地按[快速开始](../getting-started.md#本地-s3-存储)启动 `seaweedfs`，开发服务会创建示例 bucket；生产由存储管理员预先创建 bucket、配置私有策略和应用专用凭据。Storage 本身不创建 bucket。
2. 在运行环境补齐 [.env.example](../../apps/server/.env.example) 的 `STORAGE_*` 段；已有 `.env` 只补缺失项，不覆盖。设置 endpoint、region、bucket、access key、secret key 和寻址模式；本地示例为 `nest-scaffold` bucket、`us-east-1` region、path-style，凭据必须与 SeaweedFS 服务一致。生产使用自己的 HTTPS endpoint 与专用凭据，不能沿用开发示例。
3. 按实际网络选择下表地址。`STORAGE_S3_ENDPOINT` 用于服务端 S3 请求；`STORAGE_S3_PUBLIC_ENDPOINT` 用于签名，省略时使用前者。二者必须指向同一存储服务的同一个 bucket，并使用一致的 region、凭据和寻址模式。签名后不能替换 URL 的 host。
4. 业务模块统一导入 `StorageModule`，服务端读写注入 `StorageService`，浏览器直传注入 [UploaderService](#按需装配)，并由管理员配置[存储端 CORS](#bucket-cors)。应用启动会校验配置；创建预签名 URL 不代表已经连接存储或确认 bucket 就绪。

| 本地运行方式                             | `STORAGE_S3_ENDPOINT`   | `STORAGE_S3_PUBLIC_ENDPOINT` |
| ---------------------------------------- | ----------------------- | ---------------------------- |
| Nest 与浏览器均在宿主机                  | `http://127.0.0.1:8333` | 可省略，使用相同地址         |
| Nest 在同一 Compose 网络，浏览器在宿主机 | `http://seaweedfs:8333` | `http://127.0.0.1:8333`      |

容器内的 `127.0.0.1` 指向容器自身；浏览器中的 `127.0.0.1` 指向运行浏览器的机器。本地 Compose 仅绑定宿主机回环端口，不能把这份地址配置直接给远程用户。完整变量校验与默认值见[配置说明](../development/env-vars.md#storage)。

Expo 真机同样需要能访问签名中的 endpoint：手机的 `127.0.0.1` 指向手机自身，不能直接使用上表的本机地址。当前文档中的直传示例使用浏览器 `File`，尚未提供移动端文件选择与上传适配；接入时须保持签名约束并验证所选平台的请求体行为，规则见[移动端本地数据与业务文件](../development/frontends.md#移动端本地数据与业务文件)。

endpoint 填存储服务根地址，不把 bucket 或对象 key 拼进去。`STORAGE_S3_FORCE_PATH_STYLE=true` 将 bucket 放在路径中（`endpoint/bucket/key`），本地 SeaweedFS 使用这种方式；`false` 通常使用 bucket 子域名（`bucket.host/key`），需服务商的 DNS 与 TLS 支持，按其接入要求选择。

本地变量放在 `apps/server/.env`，修改后重启应用。生产通过[部署说明](../deployment.md)中的 Compose 环境文件注入，更新变量后重新创建应用容器，不能仅修改宿主机文件而继续运行旧容器。启动成功只代表配置格式有效，不代表网络、bucket 或对象权限已经验证。

## 按需装配

`StorageModule` 非全局模块，默认 `AppModule` 不导入它。需要文件能力的业务模块显式导入后，才会加载并校验 `STORAGE_*` 配置、创建客户端。模块的 `providers` 和 `exports` 均为 `[StorageService, UploaderService]`，不要把这两个服务再次放进业务模块的 `providers`。

```ts
import { StorageModule } from '@/common/modules/storage/storage.module';
import { StorageService } from '@/common/modules/storage/storage.service';
import { UploaderService } from '@/common/modules/storage/uploader.service';
import { Injectable, Module } from '@nestjs/common';

@Injectable()
export class ReportFilesService {
  constructor(
    private readonly _storage: StorageService,
    private readonly _uploader: UploaderService,
  ) {}

  // key 必须由业务层在完成认证与归属校验后生成或从数据库取得。
  public saveSummary(key: string, summary: string) {
    return this._storage.put(key, summary, {
      contentType: 'text/plain; charset=utf-8',
    });
  }

  public readSummary(key: string) {
    return this._storage.readBuffer(key, { maxBytes: 64 * 1024 });
  }

  // 由完成认证、资源归属、类型与配额校验的业务流程调用。
  public createForAuthorizedAsset(contentType: string, contentLength: number) {
    return this._uploader.createUpload({
      contentType,
      contentLength,
      prefix: 'attachments',
    });
  }
}

@Module({
  imports: [StorageModule],
  providers: [ReportFilesService],
  exports: [ReportFilesService],
})
export class ReportFilesModule {}
```

以上是服务内部示例，不是公开上传接口。脚手架没有为文件提供认证、资源归属校验或 HTTP 上传控制器；业务接口须完成这些校验后才调用 Storage / Uploader。不能直接把客户端提供的任意 key 交给 Storage。业务向浏览器返回直传链接前，还须持久化预期对象信息与用户 / 资源的关联，不能把示例方法暴露成无鉴权签发接口。

## API

以下是 `StorageService` 的方法，使用配置中的同一个 bucket，均为异步方法。`put`、`get`、`readBuffer`、`head`、`delete` 支持可选的 `abortSignal`；`presignPut` 只生成签名，不发送文件。`UploaderService` 的签发和核验 API 见[浏览器直传章节](#浏览器直传)。

| 方法                        | 参数与结果                                                                                                                   | 行为                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `put(key, body, options?)`  | `body` 为 `string`、`Uint8Array`（含 `Buffer`）或 Node.js `Readable`；返回 `{ key, etag? }`                                  | 写入或替换对象；可设 `contentType`、`metadata`                      |
| `get(key, options?)`        | 返回 `{ body, contentLength?, contentType?, etag?, lastModified?, metadata? }`                                               | `body` 是 `Readable`，调用方必须消费或销毁                          |
| `readBuffer(key, options?)` | 返回 `Buffer`；可设 `maxBytes`                                                                                               | 仅适合小文件；单次上限只能收紧配置值，不能放宽                      |
| `head(key, options?)`       | 返回不含 `body` 的元数据；对象不存在时返回 `null`                                                                            | 其他错误继续抛出，不把权限或连接失败当作不存在                      |
| `delete(key, options?)`     | 返回 `void`                                                                                                                  | 删除单个对象，重复删除不存在的 key 可成功；不删除 bucket 或清空前缀 |
| `presignPut(key, options)`  | 必填 `contentType`、`contentLength`，可选 `expiresInSeconds`；返回 `{ key, url, method, headers, contentLength, expiresAt }` | 生成短时有效、防覆盖的单次 PUT 请求信息；不是严格一次性凭证         |

`put` 默认内容类型为 `application/octet-stream`。字符串始终作为 UTF-8 内容处理，不会被解释成本地路径；模块没有路径上传参数、`local` adapter 或文件系统接口。`get` / `readBuffer` 读取不存在对象会抛错，只有 `head` 提供不存在时的 `null` 结果。

key 最多 1024 个 UTF-8 字节，不能为空，不允许反斜线、控制字符、空路径段、`.` / `..` 段或首尾 `/`。该校验只约束 key 的格式，不代表用户有权读取、覆盖或删除对象。建议业务使用自己的资源标识组织 key，并在数据库记录归属、状态与必要元数据。

`presignPut` 将 `If-None-Match: *`、`Content-Type` 和确切的 `Content-Length` 纳入签名；`contentLength` 可为 0，上限为 `min(STORAGE_MAX_UPLOAD_BYTES, 5 GiB)`，不支持浏览器分片。返回的 `headers` 为 `{ 'content-type': contentType, 'if-none-match': '*' }`，类型不放在结果顶层；浏览器会根据原始 `File` 设置长度，不应手动添加 `Content-Length`。URL 默认 300 秒有效，配置范围为 1–900 秒，单次 `expiresInSeconds` 只能收紧配置值。`expiresAt` 为 ISO 时间字符串。浏览器调用、可信记录核验与条件写入边界见 [Uploader](#浏览器直传)。

## 流与内存

生成文件时直接把流交给 `put`。例如下面的 CSV 始终在内存中生成，实际业务应让数据源逐步产出有界大小的 chunk：

```ts
import { Readable } from 'node:stream';

const body = Readable.from(['name,count\n', 'example,3\n']);
await storage.put(key, body, { contentType: 'text/csv; charset=utf-8' });
```

上传进入处理后，Storage 会消费并最终销毁输入流。流只能消费一次；失败后重试必须重新创建流与生成过程，不能复用旧流。SDK 可以重试已缓冲的单个请求，但这不等于可重新消费调用方的整个流。字符串 / Buffer 输入已经占用的内存、上游 chunk 和 SDK 开销仍需计入业务内存预算。

`get` 的超时覆盖请求和响应体读取。成功取得响应也必须继续消费 `body`；提前结束或业务处理失败时调用 `destroy()`，释放连接：

```ts
import { createHash } from 'node:crypto';

const object = await storage.get(key);
const hash = createHash('sha256');
try {
  for await (const chunk of object.body) {
    hash.update(chunk);
  }
} finally {
  object.body.destroy();
}
const digest = hash.digest('hex');
```

只需要小文件完整内容时使用 `readBuffer`，它同时检查返回的大小声明和实际累计字节，并负责释放流。不要为大文件使用无上限的 chunk 数组或 `Buffer.concat`。

## 配置与资源限制

完整变量、默认值与校验见[配置说明](../development/env-vars.md#storage)，可复制模板只维护在 [.env.example](../../apps/server/.env.example)。凭据由配置层显式注入，不回退读取 `AWS_*`、本机 AWS 凭据文件或云实例默认身份。临时凭据可提供 `STORAGE_S3_SESSION_TOKEN`，当前客户端不会自动刷新它；[临时凭据提前过期时，已签发链接也会提前失效](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)。

默认单次上传最多 100 MiB、内存读取最多 5 MiB、上传整体超时 120 秒、读取及普通请求超时 30 秒。同一个 `StorageService` 实例最多同时处理 4 个上传；达到上限直接拒绝，不排队，也不代表跨应用实例的全局配额。HTTP 入口和文件处理链仍需设置自己的请求大小、并发及超时限制。

上述上传并发和超时约束适用于 `put`。浏览器通过预签名 URL 直接发送到 S3，不经过 Nest 的上传并发控制或上传超时；签名仍限制对象大小和有效期，业务另行控制签发频率、用户配额及上传状态。

小于 5 MiB 的内容使用普通上传；达到 5 MiB 时使用 S3 multipart，固定 5 MiB 分片并串行上传，最后一片可以更小。模块最多保留当前分片进行处理，不把整个流积累后上传；上游同样需要控制缓冲。分片数量最多 10,000，调整总上传大小时也受此限制。

调用方可以把 `AbortController.signal` 传给服务端读写方法，在请求断开或任务取消时停止存储操作。模块销毁会中止在途操作，等待上传清理后释放客户端；已经签发的 URL 不会因此撤销。

## 失败、覆盖与清理

上传失败或取消时，已取得 upload ID 的 multipart 会尝试 `AbortMultipartUpload`。清理使用独立信号，超时为 `min(STORAGE_REQUEST_TIMEOUT_MS, 5000)`，不会复用已取消的上传信号；清理也失败时抛出包含两个原因的 `AggregateError`。网络故障、创建 multipart 的响应丢失或进程强制退出都可能留下未完成分片。

存储服务管理员应为应用 bucket 配置未完成 multipart 的生命周期清理，并核对服务商支持情况；模块不代替管理员修改 bucket。AWS S3 对应规则为 `AbortIncompleteMultipartUpload`，它清理未完成分片，不删除已完成对象，见 [AWS 官方说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)。

S3 对象不是 POSIX 文件；模块不支持追加或原地修改内容。对同一 key 调用 `put` 会替换当前对象，业务层必须决定同名覆盖、幂等与并发策略，例如用新 key 写入完成后再更新数据库引用。`put` 不提供条件写入或版本管理，不能把一次 `head` 后再 `put` 当作原子操作；`presignPut` 单独使用 `If-None-Match: *` 防止覆盖已有对象。

超时或取消只能停止客户端等待，服务端可能已经完成写入；不能承诺取消会原子回滚，也不能在失败后盲目 `delete(key)`，否则可能删除旧对象或其他并发写入的结果。业务应结合对象标识和状态确认最终结果。存储故障始终返回错误，不回退本地文件。

## 浏览器直传

[UploaderService](../../apps/server/src/common/modules/storage/uploader.service.ts) · [类型](../../apps/server/src/common/modules/storage/uploader.types.ts)

`UploaderService` 与 `StorageService` 共用前面的配置和模块装配：后端签发短时 PUT 链接，浏览器直接上传原始文件，后端根据可信记录检查对象大小和内容类型。服务不转发文件内容、不落盘，不提供公开 Controller、鉴权实现、数据库表或严格一次性票据。

### API 与业务流程

| 方法                                                                       | 参数与结果                                                                                        | 职责                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `createUpload({ contentType, contentLength, prefix?, expiresInSeconds? })` | 返回 `{ key, url, method: 'PUT', headers, contentLength, expiresAt }`                             | 在前缀下生成 UUID key，委托 Storage 签名；默认 key 为 `uploads/<randomUUID>`    |
| `verifyUpload(expected, options?)`                                         | `expected` 为 `{ key, contentType, contentLength }`；返回通过核对的对象元数据，支持 `abortSignal` | 只通过 `head` 读取并核对，对象不存在或类型 / 长度不匹配时抛错，不修改或删除对象 |

`contentLength` 是确切的字节数，允许 0，上限为 `min(STORAGE_MAX_UPLOAD_BYTES, 5 GiB)`。`contentType` 应由业务按照类型白名单确定，并保存签发时的原值供后续精确核对；返回值通过 `headers['content-type']` 提供类型，顶层没有 `contentType` 字段。`prefix` 由业务选择，只允许字母、数字、`_`、`-` 组成的非空路径段，以 `/` 分隔，总长度不超过 200 字符；不能直接使用原始文件名或让用户指定其他用户的路径。签名只允许写入该 key，不是读取链接。

一次直传通常经过以下步骤：

1. 业务验证当前用户、资源归属、允许类型、文件大小和配额，调用 `createUpload`。
2. 返回链接前，在业务数据库保存可信的 `{ key, contentType, contentLength }`、用户归属和待上传状态，并关联业务自己的上传记录 ID。URL 是临时授权信息，无需持久化或写入日志。
3. 浏览器按返回的 `method`、`headers` 和 `url` 上传原始 `File`，再用业务记录 ID 请求后端确认。
4. 后端重新校验当前用户与记录归属，从数据库加载原先保存的预期值，调用 `verifyUpload`；核验通过后，由业务在自己的事务中关联文件和更新状态，重复确认应幂等。

`expected` 必须来自业务持久化的可信记录，不能采用浏览器回传的 key、类型、长度作为核验标准。`verifyUpload` 的 HEAD 检查与业务数据库事务不是跨系统原子操作，配额扣减、状态转换和并发处理仍由业务负责。

### 浏览器 PUT

`upload` 为已通过业务认证取得的签发结果，`file` 为申请时选择的同一个 `File`：

```ts
if (file.size !== upload.contentLength) {
  throw new Error('文件大小与申请时不一致，请重新申请上传');
}

const response = await fetch(upload.url, {
  method: upload.method,
  headers: upload.headers,
  body: file,
  credentials: 'omit',
});

if (!response.ok && response.status !== 412) {
  throw new Error('上传未确认，请通过业务接口核验状态');
}
// 上传成功或 412 时，用业务记录 ID 请求后端确认；不要自行宣布已入库。
```

签名绑定 `If-None-Match: *`、`Content-Type` 和确切 `Content-Length`。返回的 `headers` 包含前两个头；原样发送，不能删除或修改。不要手写 `Content-Length`：它是[浏览器禁止脚本设置的请求头](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header)，浏览器根据 `File` 设置。必须把原始 `File` 作为 body；`FormData` 会增加封装字节并改变内容类型，无法匹配这份签名。`fetch` 支持 `File` 请求体，见 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#setting_a_body)。

网络错误或浏览器取消也可能发生在对象已经写入之后，此时同样应由后端先核验状态。直传只使用一个 PUT，不提供浏览器 multipart 分片；文件不经过 Nest，因此不受 `STORAGE_MAX_CONCURRENT_UPLOADS`、`STORAGE_UPLOAD_TIMEOUT_MS` 的服务端上传限制。业务需控制签发频率、用户配额，并由前端管理请求取消与等待时间。

### 短时有效与防覆盖

预签名 URL 是持有即能使用的临时写入凭证，不应进入日志、分析事件或公开消息。有效期默认 5 分钟，配置最多 15 分钟；它不是严格一次性链接，也没有内置“已消费”票据状态。

`If-None-Match: *` 要求目标 key 不存在。在支持该条件原子性的 S3 服务上，已有对象会导致 `412 Precondition Failed`；AWS S3 对同 key 的并发条件写入只允许第一个完成者成功。删除对象或存在删除标记后，同一未过期链接可能再次成功，见 [AWS 条件写入说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)。因此不要为了重试而删除该 key，也不能把收到 412 当作失败后清空对象的理由；先按可信记录调用 `verifyUpload`。

这项保护依赖存储服务实际校验签名中的条件、类型和长度，并原子执行条件 PUT。接入其他 S3 兼容服务前，应在隔离资源上验证签名校验与并发防覆盖行为，不能只凭“S3 兼容”名称推断支持。服务端 `StorageService.put` 仍是覆盖写，业务不得用它绕过上传记录的写入策略。

元数据核验不能证明文件内容安全；相同类型和长度也不代表内容相同。需要图片解码、恶意文件检查或其他内容校验的业务，应在文件可用前完成对应检测，并继续通过流或受限内存处理。

## Bucket CORS

浏览器向 S3 发送跨域 PUT，需要在存储服务的 bucket 上配置 CORS。Nest 的 `APP_CORS_*` 只管理浏览器到 Nest 的请求，不能替代 bucket CORS。

以下是供管理员参考的 Amazon S3 控制台 JSON 规则数组；示例前端来源是 `http://localhost:5173`，实际部署改成准确的协议、域名和端口。服务商控制台或管理 API 的外层格式可能不同，规则含义保持一致：

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

`http://127.0.0.1:5173` 与 `http://localhost:5173` 是不同来源，按实际前端地址配置；生产不使用通配来源。预检 OPTIONS 由存储服务处理，不把 `OPTIONS` 添加进 `AllowedMethods`。`ExposeHeaders` 仅在前端需要读取 ETag 时保留，不影响后端 `verifyUpload`。规则字段见 [AWS CORS 配置元素](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)。

CORS 不提供认证，也不让私有对象变成公开对象；bucket 权限策略仍然生效，见 [AWS CORS 配置说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html)。管理员通过独立权限配置 bucket 与 CORS，应用凭据只保留业务所需对象权限，不授予 bucket 管理或备份权限。本文只提供配置说明，不会运行桶管理命令；本地 SeaweedFS 的启动和数据卷管理见[快速开始](../getting-started.md#本地-s3-存储)。

### 在本地 SeaweedFS 应用规则

本地 Compose 关闭了 SeaweedFS 管理 UI，可选择使用 AWS CLI 配置 bucket CORS。先按 [AWS 官方安装说明](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)自行安装 AWS CLI v2，并确认本机 SeaweedFS 和示例 bucket 已创建。CLI 是独立管理工具，不是应用依赖，也不需要运行 `aws configure`。

下例仅针对 `http://127.0.0.1:8333` 上的本机开发 SeaweedFS、开发示例凭据和 `nest-scaffold` bucket。此操作需要管理员授权，且会替换 bucket 原有 CORS；执行前核对目标与已有规则。若本地配置不同，只替换成自己已确认的开发 endpoint、凭据、bucket 和前端来源，不使用生产凭据，不加载或 `source` 真实 `.env`。示例不会由应用、Compose 或文档自动执行。

```bash
env -i PATH="$PATH" \
  AWS_ACCESS_KEY_ID=local-storage \
  AWS_SECRET_ACCESS_KEY=local-storage-secret \
  AWS_CONFIG_FILE=/dev/null \
  AWS_SHARED_CREDENTIALS_FILE=/dev/null \
  aws --endpoint-url http://127.0.0.1:8333 --region us-east-1 --no-cli-pager \
  s3api put-bucket-cors --bucket nest-scaffold \
  --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:5173"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type","If-None-Match"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":300}]}'
```

该命令仅为本次 CLI 进程注入示例凭据；清空继承环境并将 AWS 配置与凭据文件指向 `/dev/null`，避免混入已有 profile、会话令牌或代理配置。CLI 参数使用 `{"CORSRules":[...]}` 外层，与 S3 控制台的规则数组格式不同，见 [`put-bucket-cors` 官方参数说明](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-cors.html)。此管理权限不授予 Nest 应用。

## 本地与生产

本地使用 [SeaweedFS 开发服务](../getting-started.md#本地-s3-存储)。开发 Compose 启动时创建 bucket；Storage 客户端本身不创建 bucket。SeaweedFS 的命名卷属于独立存储服务的数据卷，不是 Nest 应用的上传目录，也不改变应用除日志外禁止落盘的边界。

生产环境必须配置 HTTPS endpoint、预先创建的私有 bucket 和应用专用凭据。服务端 endpoint 与可选 public endpoint 都不能包含用户名、密码、路径前缀、查询或片段；生产二者均须 HTTPS，region 与寻址模式按服务商配置。本模块不设置公开 ACL，也不把已有公开 bucket 自动变成私有，需在存储端保持私有策略。直传使用的 CORS 规则由管理员独立配置，不授予应用修改 bucket CORS 的权限。

应用权限按实际使用范围限定对象读取、上传、删除及 multipart 清理；不授予 bucket 管理或备份仓库权限。应用文件与独立备份使用不同权限及命名空间，见[文件写入约束](../development/engineering-conventions.md#文件写入与-storage)。不得把长期凭据、文件内容或包含签名的 URL 写入日志。

## 验证

单测隔离配置和外部请求，并使用真实 SDK 离线验证预签名。服务端读写的[协议集成测试](../../apps/server/src/common/modules/storage/__tests__/storage.integration-spec.ts)与[直传集成测试](../../apps/server/src/common/modules/storage/__tests__/uploader.integration-spec.ts)使用测试专属的临时 SeaweedFS 容器、随机端口和独立 bucket，覆盖读写、签名约束、并发防覆盖、过期与 CORS；不读取本地 `.env`，不写真实云存储。测试只清理自己创建的资源，执行前遵守[测试安全边界](../development/testing.md#测试安全边界)。
