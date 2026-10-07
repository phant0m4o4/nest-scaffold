# 生产备份与恢复

本页补充 [Docker 部署](deployment.md) 的数据保护流程：定时、按需、变更前备份，以及恢复和演练。**仓库没有启用备份任务，以下是经负责人确认后在服务器配置的模板，不会随 CI、测试或部署自动执行。**

默认方案保持简单：数据库原生工具导出一致性备份，restic 加密保存到机外存储；定时和手动调用同一脚本，不增加 Nest 定时模块或常驻备份服务。已有托管数据库备份时，优先使用并核实其保留期、恢复粒度和导出能力，不必重复搭建相同机制。

本页属于**独立、另行授权的运维流程**。服务端应用运行时遵守[除日志外禁止本地写入、统一 S3 兼容 Storage](development/engineering-conventions.md#文件写入与-storage)的约束；这里的 SQL 暂存、恢复目录、配置与锁文件不构成应用落盘的例外。备份工具的存储后端也不等于业务 Storage 驱动，不能据此给应用增加 NAS、本地文件或其他非 S3 协议后端；不要把运维脚本嵌入应用 / Worker，或把运维目录挂给应用。

## 先确定保护目标

- **允许丢失多少数据（RPO）**：例如每日一次全量备份，在最坏情况下可能丢失接近一天的数据；任务失败、超时还会扩大窗口。不能不看业务要求就默认每天一次。
- **允许中断多久（RTO）**：包括取得备份、恢复数据库、核对数据、处理队列及切换应用的时间，不只是下载耗时。
- **保留多久、谁负责**：按业务、容量与合规要求确定保留期，明确执行人、失败通知接收人和恢复批准人。
- **备份能否独立取回**：至少有一份不在生产机器上的副本；数据库、备份存储及解密凭据不能全部依赖同一台机器。

若全量备份无法满足丢失窗口，应按数据库版本配置并验证时间点恢复：MySQL 使用完整备份与连续的 binlog，PostgreSQL 使用基础备份与 WAL 归档。日志链断裂、保留不足都可能使恢复失败；普通 SQL dump 不自动具备这种能力。参见 [MySQL 时间点恢复](https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html)、[PostgreSQL 连续归档](https://www.postgresql.org/docs/current/continuous-archiving.html)。

## 备份范围

| 对象                 | 保护与恢复原则                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| MySQL / PostgreSQL   | 业务数据、表结构与迁移记录；另行维护账号、权限和必要实例配置                                                                     |
| Redis 缓存           | 可重建的缓存通常无需恢复；不能把唯一业务数据只放在缓存里                                                                         |
| Redis 队列           | 根据任务是否可重建决定备份；恢复前核对数据库状态和已执行的外部副作用，防止重复发信、扣款等                                       |
| Redis 锁             | 历史锁不能证明恢复后的互斥关系；旧实例停用、客户端隔离后重新建立协调状态                                                         |
| 应用配置及必要密钥   | 独立加密保管服务端 `.env.production`、`APP_MASTER_KEY` 和恢复所需凭据，不放进仓库或 CI 产物；备份解密密码还须有独立保管副本      |
| 发布配置与版本记录   | 保管生产 Compose、代理配置、`images.env` 和 API / 管理后台各自已验证的 digest；与对应源码提交、迁移版本一起记录                  |
| 移动端签名与发布资料 | 独立保管 Android 签名、iOS 证书及账号恢复材料；记录应用标识、构建版本与发布产物，不随客户端 bundle 分发密钥                      |
| S3 兼容业务 Storage  | 启用上传后保护对象、版本和访问策略，以及对象与数据库记录的关联；数据库 dump 不包含对象内容，restic 仓库也不会自动备份业务 bucket |

Docker 镜像与 migration 文件不能恢复业务数据；Docker volume、主从复制、Redis 哨兵也不等于独立备份。下面脚本**仅备份一个 MySQL 业务库**，不会自动覆盖 Redis、配置、账号权限或附件。

## 何时执行

| 场景   | 操作要求                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 定时   | 在约定时区和低峰窗口执行；频率满足 RPO，监控最后成功时间，不能只看定时任务是否存在                     |
| 按需   | 数据修复、批量导入 / 更新、环境搬迁等操作前，明确目标和原因，手动执行同一脚本                          |
| 变更前 | 破坏性迁移、数据库升级前取得新的备份编号，记录当前镜像、迁移版本和恢复条件；未满足恢复要求不得开始变更 |
| 故障时 | 先隔离故障并保留日志、现有数据和历史备份，不让清理策略覆盖事故所需的恢复点                             |
| 演练   | 首次上线前、备份方案 / 数据库版本变更后，以及约定周期内，在专用隔离环境验证恢复                        |

不要求每次纯代码发布都做全量备份，但必须有满足目标的近期恢复点。变更前备份也不等于恢复时零数据损失：备份之后的新写入仍需停写协调或时间点恢复方案处理。

## 备份存储后端

备份可以保存到 **AWS S3、其他 S3 兼容对象存储，或 restic 支持的其他远端存储**。只选一种已有或适合当前项目的存储，不需要为备份新增 Nest Storage 模块、上传 SDK 或自建对象存储集群。数据库导出、定时 / 手动入口及恢复流程不变，替换的是 restic 的仓库连接配置。

| 目标                 | `RESTIC_REPOSITORY` 示例                                                  | Docker 客户端需要准备什么                                                                                  |
| -------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AWS S3               | `s3:https://s3.us-east-1.amazonaws.com/backup-bucket/nest-app-production` | 对应区域与专用凭据，见下文                                                                                 |
| S3 兼容存储          | `s3:https://storage.example.com/backup-bucket/nest-app-production`        | 服务商的 S3 API endpoint、region 与凭据；核对寻址方式                                                      |
| Azure Blob           | `azure:backup-container:/nest-app-production`                             | 专用容器与 SAS 等凭据，见下文                                                                              |
| Google Cloud Storage | `gs:backup-bucket:/nest-app-production`                                   | `GOOGLE_PROJECT_ID`；使用 JSON 凭据时额外只读挂载文件，`GOOGLE_APPLICATION_CREDENTIALS` 指向**容器内**路径 |
| SFTP 远端服务器      | `sftp:backup@backup.example.com:/srv/restic/nest-app-production`          | SSH 客户端、只读挂载的专用私钥与 SSH 配置、核验过的 `known_hosts`；核对容器运行用户、HOME 和读取权限       |
| 独立 NAS / 网络盘    | `/repository/nest-app-production`                                         | 宿主机先挂载远端存储，再把该目录读写绑定到容器 `/repository`                                               |

AWS S3、通用 S3 兼容存储和下面的 Azure 示例可复用本页 Docker 包装脚本；GCS 文件凭据、SFTP 与 NAS **需要额外挂载或客户端配置，不能只改仓库地址**。其他服务可按需通过 rclone 接入，但备份镜像还须具备固定版本的 rclone 及其配置，本项目不默认增加这层依赖。后端与认证参数见 [restic 官方存储说明](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)。

### S3 配置

在备份服务器单独维护 `/srv/nest-backup/restic.env`，不要写入应用的 `.env.production`、`.env.example` 或 GitHub CI。以下配置二选一，替换所有示例目标与凭据。

AWS S3 示例，endpoint 和 region 必须与实际 bucket 一致：

```dotenv
RESTIC_REPOSITORY=s3:https://s3.us-east-1.amazonaws.com/backup-bucket/nest-app-production
AWS_DEFAULT_REGION=us-east-1
AWS_ACCESS_KEY_ID=REPLACE_WITH_BACKUP_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_BACKUP_SECRET_KEY
```

其他 S3 兼容存储使用服务商提供的 **S3 API endpoint**，不是控制台地址、公开下载地址或 CDN 域名：

```dotenv
RESTIC_REPOSITORY=s3:https://storage.example.com/backup-bucket/nest-app-production
AWS_DEFAULT_REGION=REPLACE_WITH_STORAGE_REGION
AWS_ACCESS_KEY_ID=REPLACE_WITH_BACKUP_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=REPLACE_WITH_BACKUP_SECRET_KEY
```

使用临时凭据时还须设置 `AWS_SESSION_TOKEN`，并在任务开始前安全刷新，确保有效期覆盖任务执行；把一次性的 token 写进文件并不会自动续期。S3 兼容不代表所有参数相同，例如阿里云 OSS 还需按官方说明在包装脚本的 restic 参数中加入 `-o s3.bucket-lookup=dns` 并指定正确 region；初始化、备份、检查和恢复都使用同一套参数。参见 [S3 兼容配置](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage)与 [OSS 配置](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#alibaba-cloud-aliyun-object-storage-system-oss)。

### Azure Blob 配置示例

已有 Azure 存储时，可改用专用私有容器及限制范围和有效期的 SAS；不必额外采购 S3。`restic.env` 改为：

```dotenv
RESTIC_REPOSITORY=azure:backup-container:/nest-app-production
AZURE_ACCOUNT_NAME=REPLACE_WITH_STORAGE_ACCOUNT
AZURE_ACCOUNT_SAS=REPLACE_WITH_CONTAINER_SAS_TOKEN
```

SAS 权限需覆盖实际仓库操作，并配置到期前轮换与告警；不要同时残留旧的 S3 或 Azure account key。其他认证方式和非默认云的 endpoint suffix 见 [restic Azure Blob 配置](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#microsoft-azure-blob-storage)。

### 存储安全与切换

- 先由负责人创建并核对私有 bucket / container、区域与专用仓库路径，凭据限制在必要范围，不给云账号管理员权限。路径前缀只是命名，真正隔离还需要存储端授权策略；备份凭据与应用上传凭据分开管理。
- restic 正常操作不只是上传，还需要读取、列举及清理锁等权限；不能把简单的“只写不删”策略直接当作可用配置。采用版本保护 / 不可变副本时，按后端验证锁清理、`forget/prune`、版本恢复及费用。AWS Object Lock 保护对象版本，普通删除仍可能成功添加删除标记；`prune` 成功不等于历史版本占用已释放，见 [S3 Object Lock 删除语义](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html#how-object-lock-works-deletes)。
- `restic.env` 与密码文件均为 `0600`。Docker `--env-file` 不做变量插值，值不额外包引号。独立随机解密密码保存在 `/srv/nest-backup/restic-password`，不复用数据库或存储密码，不通过命令行参数传递，另有独立保管副本；有存储凭据但丢失解密密码，仍无法恢复。
- HTTPS 校验证书；私有 CA 需要只读挂载并配置 restic `--cacert`，不禁用 TLS 验证。SFTP 核对服务端指纹并严格校验主机密钥，不用 `StrictHostKeyChecking=no` 绕过失败。
- NAS 使用前校验**预期远端文件系统确已挂载**，未挂载就失败退出，避免悄悄写入同名本地空目录。核对容器 UID 的读写权限和文件系统兼容性；同机磁盘、同机 Docker volume 不算机外副本。参见 [restic 本地 / 网络盘限制](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#local)。
- 切换 `RESTIC_REPOSITORY` **不会搬迁旧快照**。新仓库需单独初始化并完成备份与隔离恢复验证，旧仓库、凭据及密码按原保留要求保管；不是修改地址后就可以删除旧备份。恢复主机也须准备所选后端对应的客户端与认证材料。
- 核算容量、请求、下载及跨区域流量费用。活动仓库保持可直接读取，不直接套用按对象年龄删除或转入需解冻的归档层策略；保留与回收按下文执行。

## MySQL：一份脚本同时支持手动和定时

### 准备条件

以下为 Linux 服务器模板，只需 Docker、Bash、`flock` 及已有定时工具。生产数据库和 Redis 独立维护，不复用仓库的[开发 Compose](../deploy/docker-compose.yml)。

1. 使用专用备份账号和私有目录 `/srv/nest-backup`，目录权限 `0700`，凭据文件 `0600`。Docker 使用权限属于高权限，不向不可信账号开放。
2. 准备 `mysql/`、`staging/` 和 `restore/` 子目录；暂存盘需要足够空间，建议磁盘加密。导出阶段存在短暂的明文 SQL，不能放在网站目录、共享目录或仓库里。
3. 核对实际数据库版本、存储引擎、容量和备份窗口。将脚本的镜像占位值替换为经验证的固定版本或 digest；MySQL 客户端应与生产服务端匹配，不照搬开发用的浮动 `mysql:9`。
4. MySQL 使用专用最小权限账号，不授予业务写入 / 删表权限；按实际对象配置 `SELECT`、`SHOW VIEW`、`TRIGGER`、`EVENT` 及导出存储程序所需权限，不能简单授予 `ALL`。
5. 备份和迁移不得并发。下面脚本复用部署示例的 `/srv/nest-app/.deploy.lock`，并另设备份维护锁；该目录须已存在且备份账号能使用同一锁文件。其他服务器或人工 DDL 仍需安排统一窗口，文件锁不能约束它们。

`/srv/nest-backup/mysql/client.cnf` 仅写已核对的生产备份连接，另将数据库 CA 保存为同目录的 `ca.pem`；配置文件中的特殊字符按 MySQL 选项文件规则转义：

```ini
[client]
host=db.internal.example
port=3306
user=backup_reader
password=REPLACE_WITH_BACKUP_PASSWORD
protocol=tcp
ssl-mode=VERIFY_IDENTITY
ssl-ca=/run/secrets/mysql/ca.pem
```

示例使用容器能访问的内网 DNS 与校验通过的 TLS，不能用关闭证书验证来排障。若数据库仅在某个 Docker 网络中，需为数据库客户端明确添加对应 `--network`；容器中的 localhost 不是宿主机。

按[备份存储后端](#备份存储后端)准备 `/srv/nest-backup/restic.env` 与独立的 `/srv/nest-backup/restic-password`；存储凭据和数据库凭据分开管理。下面包装脚本默认用于无需额外挂载的对象存储配置，选用其他后端时先完成对应适配。

### Docker 备份客户端

保存为服务器上的 `/srv/nest-backup/restic.sh`，不复制到应用容器。基础模板只挂载备份暂存、恢复目录和解密密码；按所选后端添加必要的凭据或仓库挂载，不挂载数据库数据卷或 Docker socket：

```bash
#!/usr/bin/env bash
set -euo pipefail
restic_image='restic/restic:REPLACE_WITH_PINNED_VERSION'
source_dir="${BACKUP_SOURCE:-/srv/nest-backup/staging}"

docker run --rm --user "$(id -u):$(id -g)" \
  --hostname nest-app-production-backup \
  --env-file /srv/nest-backup/restic.env \
  --env RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  --mount type=bind,src=/srv/nest-backup/restic-password,dst=/run/secrets/restic-password,readonly \
  --mount "type=bind,src=$source_dir,dst=/backup,readonly" \
  --mount type=bind,src=/srv/nest-backup/restore,dst=/restore \
  "$restic_image" --no-cache "$@"
```

固定 hostname 和容器内 `/backup` 路径，使快照身份、查询及保留规则稳定；不同项目 / 环境使用不同标识和仓库前缀，参见 [restic Docker 用法](https://restic.readthedocs.io/en/stable/020_installation.html#docker-container)。此包装脚本不负责加锁，下面的调用入口统一持有维护锁。

由负责人确认目标仓库后，**首次初始化一次**，不是每次备份都执行：

```bash
flock -n /srv/nest-backup/.backup.lock \
  bash /srv/nest-backup/restic.sh init
```

### 备份脚本

保存为 `/srv/nest-backup/backup-mysql.sh`，修改镜像和库名占位值后使用：

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
mysql_image='mysql:REPLACE_WITH_PINNED_VERSION'
database='REPLACE_WITH_DATABASE_NAME'
reason="${1:-manual}"
case "$reason" in scheduled|manual|pre-change) ;; *) exit 2 ;; esac

# 与部署互斥；不要在已持有 .deploy.lock 的 deploy.sh 内再次调用本脚本。
exec 8>/srv/nest-app/.deploy.lock
flock -n 8 || { echo 'Deployment is running; backup aborted' >&2; exit 1; }
exec 9>/srv/nest-backup/.backup.lock
flock -n 9 || { echo 'Backup maintenance is running' >&2; exit 1; }

stage_dir=$(mktemp -d /srv/nest-backup/staging/backup.XXXXXX)
trap 'rm -f "$stage_dir/database.sql.partial" "$stage_dir/database.sql" "$stage_dir/metadata.txt"; rmdir "$stage_dir"' EXIT

docker run --rm --user "$(id -u):$(id -g)" \
  --mount type=bind,src=/srv/nest-backup/mysql,dst=/run/secrets/mysql,readonly \
  "$mysql_image" mysqldump --defaults-file=/run/secrets/mysql/client.cnf \
  --single-transaction --quick --hex-blob \
  --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF \
  "$database" > "$stage_dir/database.sql.partial"

test -s "$stage_dir/database.sql.partial"
mv "$stage_dir/database.sql.partial" "$stage_dir/database.sql"
{
  printf 'created_utc=%s\n' "$(date -u +%FT%TZ)"
  printf 'database=%s\nclient_image=%s\nreason=%s\n' "$database" "$mysql_image" "$reason"
  if [[ -s /srv/nest-app/current-image ]]; then
    printf 'application_image=%s\n' "$(</srv/nest-app/current-image)"
  fi
} > "$stage_dir/metadata.txt"

# 只有 dump 成功才上传；任何非零退出码都不得更新成功记录。
BACKUP_SOURCE="$stage_dir" bash /srv/nest-backup/restic.sh \
  backup /backup --tag mysql --tag "$reason" --json \
  > /srv/nest-backup/last-success.json.next
cat /srv/nest-backup/last-success.json.next >> /srv/nest-backup/success-history.jsonl
mv /srv/nest-backup/last-success.json.next /srv/nest-backup/last-success.json
```

这里采用单库逻辑备份：`--single-transaction` 的一致性仅适用于 InnoDB，导出期间不得执行迁移或其他 DDL；非事务表不能套用此保证。显式导出存储程序、事件与触发器，不导出 tablespace DDL，不携带 GTID 初始化状态；该示例不用于复制初始化或整实例克隆。详见 [`mysqldump` 官方限制](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html)。

导出或上传失败会退出，删除本次私有临时 SQL，不更新 `last-success.json`，也不删除历史备份。正常结束同样清理暂存明文；进程被强制杀死或机器宕机可能留下目录，需核对无任务使用后清理具体残留，不能全局 prune。

restic 退出码 `3` 也表示失败，且可能已经留下不完整快照；因此**不能把最新快照或文件非空当作成功**。`success-history.jsonl` 只追加成功运行的输出，以其中 JSON summary 的 `snapshot_id` 识别完整快照；该记录也应安全保管，并按备份保留窗口轮转。变更前备份另行记录该 ID、时间、目标实例、服务端版本和应用 / 迁移版本。参见 [restic 脚本与退出码](https://restic.readthedocs.io/en/stable/075_scripting.html#exit-codes)。

### 按需与定时入口

经确认后在备份服务器执行：

```bash
# 普通按需备份
bash /srv/nest-backup/backup-mysql.sh manual

# 升级、迁移或批量修改前；成功记录需关联到该次变更
bash /srv/nest-backup/backup-mysql.sh pre-change
```

定时示例是**备份账号的用户 crontab**，不含用户名字段。以下每天 02:00 仅为演示，按 RPO 修改，并记录服务器时区；例如采用 UTC 时要明确这不是北京时间 02:00。先完成首次手动备份与隔离恢复验证，再由负责人安装计划：

```cron
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * /bin/bash /srv/nest-backup/backup-mysql.sh scheduled >> /srv/nest-backup/backup.log 2>&1
```

日志预先设置为 `0600` 并配置轮转；cron 的重定向发生在脚本的 `umask` 生效之前。接入已有监控，至少对非零退出、超时、磁盘不足、`last-success.json` 超过允许间隔未更新告警；只有日志没有通知不算监控。锁冲突也是一次失败，不能静默当作成功。不要将凭据或 SQL 内容输出到日志。

普通 GitHub CI 不持有生产备份凭据，也不跑生产备份。变更前备份目前是独立的运维步骤，部署模板**没有自动备份门禁**；负责人须在迁移前核对记录，不能在部署脚本已持有锁时递归调用备份脚本。

## 保留、检查与删除

定时、手动、变更前快照分别带 `scheduled`、`manual`、`pre-change` 标签。下面仅演示**定时快照的删除预览**，不是已经确定的保留要求：

```bash
flock -n /srv/nest-backup/.backup.lock \
  bash /srv/nest-backup/restic.sh forget \
  --host nest-app-production-backup --tag mysql,scheduled \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --dry-run

flock -n /srv/nest-backup/.backup.lock \
  bash /srv/nest-backup/restic.sh check
```

先核对预览、成功运行记录及最后可恢复的快照，确认未把不完整快照计入有效恢复点；再经授权执行删除与空间回收。`manual` / `pre-change` 不在上述筛选范围内，变更验收、回退窗口或事故调查结束前保留，之后按另行确认的期限清理，不能无限堆积也不能随定时快照误删。

`--keep-daily 7` 是保留最近七个**有快照的日期**，不能据此证明最近七天每天成功。不要让对象存储生命周期规则直接删除 restic 当前仓库中的数据对象；使用其快照保留与回收机制，见 [restic 保留规则](https://restic.readthedocs.io/en/stable/060_forget.html)。

`check` 默认检查仓库结构，周期性 `check --read-data` 才会读取并验证全部备份数据，需评估带宽和费用；两者都不能替代数据库恢复演练。备份、检查和回收共用维护锁，不通过自动 `unlock` 或 `--no-lock` 绕过冲突。见 [完整性检查](https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency)。

备份加密不能防止拥有仓库权限的账号删除备份。按实际风险配置独立存储权限、版本保护 / 不可变副本及经验证的保留策略；数据库凭据、存储凭据和解密密码分开管理，不使用不可信公共存储或 GitHub Actions artifacts 保存生产备份。

## 恢复与演练

恢复生产数据是单独授权的运维操作，不属于 `pnpm test`。演练不覆盖生产库，不启动可连接真实外部接口的应用 / Worker / 定时任务，不加载主网私钥、不签署或广播主网交易；遵守[测试安全边界](development/testing.md#测试安全边界)。生产数据副本仍需按敏感数据保护，不能上传到普通测试环境或仓库。

1. 明确故障范围、允许丢失的数据时间点、目标备份 ID、负责人及停写窗口，保留现有数据和证据。不要把“回退应用镜像”当成数据库恢复。
2. 在专用隔离主机或隔离 Docker 网络中建立新的恢复实例，不连接生产网络；只开放下载备份所需通道，下载后关闭该通道。核对镜像、数据库版本、磁盘、账号权限与解密材料。
3. 选择已确认完整的具体快照，恢复到新建空目录；不要使用无条件的 `latest`。下面包装脚本应部署在恢复主机，并使用该主机的独立凭据和目录，**不是直接在生产数据库目录执行**：

```bash
SNAPSHOT_ID='REPLACE_WITH_CONFIRMED_COMPLETE_SNAPSHOT_ID'
flock -n /srv/nest-backup/.backup.lock \
  bash /srv/nest-backup/restic.sh restore "$SNAPSHOT_ID:/backup" \
  --target "/restore/$SNAPSHOT_ID" --verify
```

`ID:/backup` 只恢复该子目录内容；按本例，SQL 位于宿主机 `/srv/nest-backup/restore/<ID>/database.sql`。每次使用新的空目录，避免覆盖已有恢复结果，参见 [restic 恢复路径](https://restic.readthedocs.io/en/stable/050_restore.html#restoring-from-a-snapshot)。

4. MySQL 恢复实例先关闭 Event Scheduler，在该**隔离实例**创建与源库同名的空库，预备必要的 `DEFINER` 账号、权限及字符集。同名库避免视图 / 存储程序中的限定库名引用失效；SQL 可能包含 `DROP TABLE`，不能导入既有业务库。恢复客户端单独使用指向隔离实例的 `client.cnf`，绝不复用生产备份连接：

```bash
# 变量须事先核对：固定客户端镜像、隔离网络、恢复专用凭据目录、同名空库、已验证 SQL。
docker run --rm -i --network "$RESTORE_NETWORK" \
  --mount "type=bind,src=$RESTORE_MYSQL_CONFIG_DIR,dst=/run/secrets/mysql,readonly" \
  "$MYSQL_CLIENT_IMAGE" mysql --defaults-file=/run/secrets/mysql/client.cnf \
  "$RESTORE_DATABASE" < "$RESTORE_SQL"
```

5. 核对迁移记录、关键表数量 / 约束、业务汇总、账号权限及必要配置；逐步核对 Redis 队列与数据库时间点的一致性。恢复 SQL 本身可能执行存储对象中的代码，隔离环境不能拥有外部写入能力；导入成功只是检查的一部分。
6. **演练到此停止，不切换生产**；记录备份 ID、恢复耗时、检查结果与未覆盖项，按数据保管规则清理本次隔离资源。真实事故恢复则须经负责人批准，在控制停写与防双写后切换连接，先做无副作用只读检查，再有序恢复业务与任务处理，并保留回退所需的原实例。

MySQL 恢复权限与事件行为见[存储对象安全](https://dev.mysql.com/doc/refman/8.4/en/stored-objects-security.html)和[事件调度器配置](https://dev.mysql.com/doc/refman/8.4/en/events-configuration.html)。不要自动把生产凭据或队列消费者带入演练环境。

## PostgreSQL 适配

项目默认 MySQL；选用 PostgreSQL 后，采用同样的锁、暂存、加密上传、成功记录和恢复审批流程，只替换数据库导出 / 导入部分。不要把 MySQL SQL 文件用于 PostgreSQL，也不要仅为文档完整而同时启用两套备份。

- 使用与服务端匹配并固定的 PostgreSQL 客户端镜像；`pg_dump` 不能备份比客户端更新的主版本，降级恢复也没有保证。
- 用只读挂载、权限 `0600` 的 pgpass 文件，通过 `PGPASSFILE` 指定；另行配置 TLS 证书校验，不使用命令行明文密码。
- 导出采用 `pg_dump --no-password --format=custom --host=... --username=... --dbname=...`，先输出 `database.dump.partial`，成功后改名，再交给同一个 restic 流程。单库 dump 不包含集群角色与 tablespace 定义，需另行保护并核对所需扩展。
- 恢复时先用 `createdb --template=template0` 在隔离实例建新空库，再用 `pg_restore --no-password --exit-on-error --dbname=<新库> <备份文件>`。**不要加 `--create/-C`**，否则目标库名取自归档，`--dbname` 只是初始连接库。
- 创建库和导入时的 pgpass 记录要分别匹配维护库与恢复库。提前建立所需角色；若演练使用 `--no-owner --no-acl`，必须注明未验证生产权限恢复。

客户端仍通过 `docker run --rm` 执行，宿主机不安装数据库服务。具体参数以实际版本的 [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html)、[`pg_restore`](https://www.postgresql.org/docs/current/app-pgrestore.html)与[密码文件规则](https://www.postgresql.org/docs/current/libpq-pgpass.html)为准。

## Redis 与配置恢复的补充约束

- RDB / AOF 持久化不是机外备份。根据实际 Redis 版本采用受支持的备份流程；不能把运行中的数据目录随意打包当作一致性备份。多文件 AOF 在重写期间直接复制可能无效，详见 [Redis 备份说明](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/#backing-up-redis-data)。
- 同一 Redis 实例的不同 DB 不能据此推断备份相互独立。恢复快照应先落到新实例，不能整体覆盖仍在使用的缓存 / 锁 / 队列实例；哨兵也不能防止误删除被复制。
- 队列恢复后保持 Worker 停用，核对任务与业务库及外部系统中已完成动作，依靠业务幂等和对账处理重复 / 遗漏；演练不实际重放邮件、支付、Webhook 或主网操作。
- 缓存按需重建；历史锁不能直接恢复为有效持锁状态。必须先隔离旧客户端、确认没有旧任务继续执行，再按模块和键范围恢复协调，不能对共享 Redis 执行 `FLUSHALL`。
- 配置和密钥从独立保管渠道恢复到正确环境；`APP_MASTER_KEY` 更换会导致旧加密游标无法解码，不能为“恢复成功”随意生成替代值，见[配置说明](development/env-vars.md)。任何真实钱包密钥都不放进普通备份示例或恢复演练。
