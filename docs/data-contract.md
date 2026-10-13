# 来源数据合同 v1

服务端最终合同在 `shared/schema.ts`。所有写接口需要 `Authorization: Bearer INGEST_TOKEN`；最多 6 MB。成功 200，输入不合格 400/422，版本乱序或并发冲突 409，超限 413，未配置密钥 503。

## 卡牌展示目录

`POST /api/ingest/release` 只接受 `cr-data-community` 和 `supercell-api` 两个来源的基础目录。保留原有 release/head 存储以支持幂等、来源时间和卡组展示，不再计算或写入参数差异。

目录字段：`stream`、`revision`、`source_url`、`source_updated_at`、`observed_at`、`title`、`cards`。每张卡包含官方数值 `id`、`key`、`name`、`name_en`、`description`、`type`、`rarity`、`elixir`、`arena`、`image_url` 和兼容字段 `stats: {}`。未知 arena 为 null；图片需使用共享校验允许的 HTTPS 域名。非空 stats 和 archive/custom feed 等来源均返回 400，不再接受战斗参数。

完整合同见 `shared/schema.ts`。同内容更新只更新观测时间，不制造重复目录版本；乱序或并发更新返回 409，覆盖下降超过 10% 返回 422。

## 卡组

`POST /api/ingest/decks`：`{"decks":[...]}`，每批最多 50 条。每个观察必须包含：

- `region: "global"`，国服尚未启用。
- `slots`，恰好 8 个不同的官方 ID；每项有 `variant`，取 normal/evolution/hero/unknown。
- `source`，稳定来源标识；`source_url`，实际 HTTPS 原文或公开数据位置。
- `title`，来源给出的名称或明确标注的组成名称。
- `kind`，preset/player/community。
- `observed_at`，本站采集时间，ISO UTC。

未知特殊形态必须为 unknown；社区样本虽然可能带代表性的特殊图片，因为按基础 ID 合并了统计，不能把图片当成整个聚合卡组的形态证据。

ID 按区服与排序后的卡牌/形态计算；出处单独 upsert。基础链接生成只是语法层构造，游戏内验证属于另一个流程。

### 展示槽位与来源形态

`shared/deck-layout.ts` 将组成编排为两行四列。按照 [Supercell 2026-03-16 槽位规则](https://supercell.com/en/games/clashroyale/blog/news/mid-march-update/)，前三槽为觉醒（Evolution）、精英（Hero/Champion）、魔法（Wild），其余为普通栏位。精英栏位接受 Hero 或 Champion，魔法栏位接受 Evolution、Hero 或 Champion。中文术语以官方「觉醒栏位、精英栏位、魔法栏位」为准；Hero 是精英形态，Champion 是英雄牌。自配编辑行为详见 [规则核对](deck-rules.md)。

这是一层显示编排，不是采集出的原始位置。已知 evolution 优先放入第 1 槽，已知 hero 或 normal + Champion 优先放入第 2 槽，剩余已知特殊卡放入第 3 槽；其余按来源相对顺序填充。超过容量的特殊形态保留并显示冲突，不删卡或篡改形态。normal 与 unknown 不因为放进前三槽就变成觉醒或 Hero。

列表、详情和我的卡组复用 `DeckSlots` 组件；基础导入链接采用相同显示顺序。源 `slots`、数据库记录、形态、收藏去重 ID 均不修改。现有数组不承诺真实槽序；将来接入精确位置证据时，应单独建模该证据，不能把当前推导位置冒充原始位置。未读取到 Champion 稀有度时不猜测英雄牌身份。

## 运行记录

`POST /api/ingest/run`：id(UUID)、source、started_at、finished_at、status(success/failed/blocked)、count、message。仅记录可公开的摘要，禁止含 token、玩家私密信息或完整异常 HTTP 头。抓取失败时仍尽量报告；发布失败则留在 outbox。

## 读接口

- `/api/status`：来源 head、唯一卡组数、各来源最近运行。
- `/api/cards/dictionary?stream=...&release=...`：卡组展示所需的基本资料，仅支持两个有效目录来源，stats 永远为空。
- `/api/deck-builder`：配卡所需的基础目录及形态、素材能力。
- `/api/decks?q=...&card=...&kind=...&page=1&limit=12`：分页卡组。
- `/api/decks?ids=hash1,hash2`：收藏批量，最多 60 个 ID。
- `/api/health`：D1 连通性。

公告简报 `/api/balance-briefs`、卡牌图鉴 `/api/cards`、卡牌参数详情 `/api/cards/{id}`、历史版本 `/api/releases`、差异 `/api/compare` 均已移除，返回 404。

读接口无用户登录；收藏保存在浏览器，不提供跨设备同步。

`/api/deck-builder` 提供配卡收藏册，字段包括基础 ID、中文名/英文名、图片、圣水、类型、稀有度、目录支持形态。`local:<UUID>` 自配卡组仅在浏览器保存，不能用于公共 `/api/decks?ids=…` 查询，也不通过入库接口发布。前端 `Deck` 的 `name` 和 `slot_order: explicit` 用于本地用户配置；它们不改变公共 deck ingest 合同或收藏身份算法。
