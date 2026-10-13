# 本地运行与 Cloudflare 部署

## 本地运行

Node.js 22.12+（建议 22 LTS），Python 3.12+，uv。仓库附带卡牌基础展示目录、历史预设卡组和社区样本，便于离线引导。卡牌参数与历史对比已下线，archive/feed 采集已移除；旧参数文件保留但不再导入。

```bash
npm ci
uv sync --directory crawler --frozen
npm run build
npm run db:migrate
```

复制 `.env.example` 中的 `INGEST_TOKEN` 设置到被 Git 忽略的 `.dev.vars`，使用随机长令牌。此文件只需本地 Worker 的 secret，例如 `INGEST_TOKEN=你的随机长令牌`。当前工作区已经生成了本地随机令牌，不应提交到 Git。

终端 1：

```bash
npm run preview
```

终端 2：

```bash
npm run db:seed
# 可选：前端热更新，API 代理到 8787
npm run dev
```

浏览 [本地预览](http://localhost:8787)。生产构建内容发生变化时重新 `npm run build`；若 Wrangler 提示 Assets 目录监听不可用，重启预览进程后刷新浏览器。

本地 seed 走与生产相同的校验与事务 API，只允许 localhost 目标。不直接拼 SQL 绕过入库逻辑。重复运行会幂等去重。

重新抓取真实来源，仅保存文件、不上传：

```bash
uv run --directory crawler --frozen python -m arena --source community
```

若进程设置了 `ARENA_API_URL`，则需要 `INGEST_TOKEN`，并会在抓取时发布。敏感变量通过 runner secrets 或进程环境传入，不写入前端或命令历史。采集器仅支持 community/official；无需执行历史参数引导。

## 首次 Cloudflare 上线

仓库内的 D1 ID 是本地占位，不可直接部署生产。不要复用 `clash-of-clans` 的数据库和秘密。

```bash
npx wrangler login
npx wrangler d1 create royale-atlas
```

将返回的真实 D1 ID 写入 `wrangler.jsonc` 的 `d1_databases[0].database_id`。Worker 默认名为 `royale-atlas`，若账户内同名服务已有其他用途，先改 name。绑定自定义域名可在部署成功后通过 Cloudflare 控制台设置。

```bash
npx wrangler d1 migrations apply royale-atlas --remote
npx wrangler secret put INGEST_TOKEN
npm run deploy
```

本地 OAuth 凭据只由 Wrangler 管理；不要复制另一个项目的 auth 文件。配置的令牌需要与采集任务中的 `INGEST_TOKEN` 相同，建议至少 32 字节随机值。

用实际 Worker URL 做检查：

```bash
curl https://你的服务.workers.dev/api/health
```

之后在设置了生产 `ARENA_API_URL` 和 `INGEST_TOKEN` 的受保护环境中执行 community 采集以导入展示目录与社区卡组。官方来源另行配置 `CLASH_API_TOKEN`，由允许的固定出口 IP 请求；`PLAYER_TAGS` 为逗号分隔的国际服玩家标签。通过 `/api/status` 和网页来源页确认来源日期、数量及采集状态。

## GitHub Actions

推送到自己控制的 GitHub 仓库，建立 `production` environment。

Secrets：

| 名称                    | 用途                                     |
| ----------------------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workers 部署及对应 D1 读写所需的最小权限 |
| `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare 账户                     |
| `INGEST_TOKEN`          | 采集任务调用 Worker 写接口               |
| `CLASH_API_TOKEN`       | 可选，官方 API 来源                      |

Environment variables：

| 名称               | 用途                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `CLOUDFLARE_D1_ID` | 真实生产数据库 ID，部署时生成配置                                |
| `ARENA_API_URL`    | 实际服务 HTTPS URL，不能留空，否则采集任务失败                   |
| `PLAYER_TAGS`      | 可选，指定玩家采集范围                                           |
| `ENABLE_OFFICIAL`  | 明确设 `true` 才启用官方每月任务                                 |
| `OFFICIAL_RUNNER`  | JSON runner labels，如 `["self-hosted","linux","static-egress"]` |

- `check.yml`：推送和 PR 后构建、单元测试、Python 测试、真实本地 D1 集成验证。
- `deploy.yml`：手动触发；校验 D1 ID、应用迁移、发布 Worker。INGEST_TOKEN 由 `wrangler secret put` 单独建立，本工作流不会自动覆盖或轮换。
- `crawl.yml`：每月 1 日北京时间 **08:17** 抓 community 来源（UTC cron：`17 0 1 * *`）；实际运行可能延迟。手动入口仅保留 community/official。

官方 key 的 IP 白名单应匹配固定出口 runner。未验证的免费代理不作为默认方案，也不把 API key 发到第三方代理。archive 与参数 feed 已退出工作流和 CLI，不会恢复抓取。旧投递队列中的参数任务保存在 `outbox/<目标>/retired/`，不会再次发送。

HTTP cache 通过 Actions cache 加速。outbox 从最近的来源附件恢复，失败消息在成功确认之前保留；raw/runs/outbox 附件保留 90 天。GitHub 仓库的 Actions 配额、停用策略和附件保留都需要维护者检查。源码工作流文件存在并不表示线上任务已经启用。

## 检查与备份

```bash
npm test
npm run build
npm run test:integration
uv run --directory crawler --frozen pytest
npx wrangler d1 export royale-atlas --remote --output /安全目录/royale-atlas.sql
```

数据库备份可能含配置的玩家公开资料和运行记录，应保存在受控目录。测试恢复到独立 D1，不覆盖生产。至少每月备份一次，卡组来源更新频繁时增加频率；本文提供操作流程，尚未配置自动备份任务。

迁移采用先扩展再收缩。Worker 回退命令不能还原 D1 数据；任何删除字段或清除版本前先导出并验证恢复。

关注：健康接口、来源最近成功时间、失败率、D1 读写/存储、Worker 请求量、来源目录更新时间。当前生产资源、域名、GitHub 仓库与账户凭据都需要通过实际部署结果确认，不能用本地验证声称生产已上线。
