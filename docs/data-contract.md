# 来源数据合同 v1

服务端最终合同在 `shared/schema.ts`。所有写接口需要 `Authorization: Bearer INGEST_TOKEN`；最多 6 MB。成功 200，输入不合格 400/422，版本乱序或并发冲突 409，超限 413，未配置密钥 503。

## 参数快照

`POST /api/ingest/release`，同时也是 `STATS_FEED_URL` 应返回的 JSON 结构：

```json
{
  "stream": "your-maintained-parameters",
  "revision": "upstream-commit-or-build-id",
  "source_url": "https://example.com/actual-source",
  "source_updated_at": "2026-10-13T00:00:00Z",
  "observed_at": "2026-10-13T00:10:00Z",
  "title": "2026-10 参数快照",
  "cards": [
    {
      "id": 26000000,
      "key": "knight",
      "name": "骑士",
      "name_en": "Knight",
      "description": "来源描述",
      "type": "Troop",
      "rarity": "Common",
      "elixir": 3,
      "arena": null,
      "image_url": null,
      "stats": { "characters/Knight": { "hitpoints": 100, "hit_speed": 1200 } }
    }
  ]
}
```

示例数值仅用于说明合同，**不是实际骑士参数**，不能用来生产 seed。来源流只能包含同一口径，不能混入其他来源的历史参数。`source_updated_at` 必须表示已知上游版本时间；上游只提供观测时间时，应明确标为观测。未知 arena 为 null，不填 0 冒充训练营。

`stats` 以组件分组，保存可验证的来源值，按等级数组保留原索引。缺失数值不推算。来源数据类型/单位变化需要新流或迁移计划。image_url 只允许预设素材域名，需新增域名时修改共享校验并核对使用条件。

服务器自己计算 commit ID、parent、diff 和内容 hash；不信任采集器传来的分类和百分比。同内容更新不制造新提交。小于既有覆盖 90% 的新快照需要人工复核。

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

列表、详情和简报复用 `DeckSlots` 组件；基础导入链接采用相同显示顺序。源 `slots`、数据库记录、形态、收藏去重 ID 均不修改。现有数组不承诺真实槽序；将来接入精确位置证据时，应单独建模该证据，不能把当前推导位置冒充原始位置。未读取到 Champion 稀有度时不猜测英雄牌身份。

## 运行记录

`POST /api/ingest/run`：id(UUID)、source、started_at、finished_at、status(success/failed/blocked)、count、message。仅记录可公开的摘要，禁止含 token、玩家私密信息或完整异常 HTTP 头。抓取失败时仍尽量报告；发布失败则留在 outbox。

## 读接口

- `/api/status`：来源 head、唯一卡组数、各来源最近运行。
- `/api/cards?stream=...&q=...&type=...&rarity=...&elixir=...&page=1&limit=24`：图鉴。
- `/api/cards?stream=...&release=...`：不可变的指定快照。
- `/api/cards/{id}?stream=...`：卡牌与最近变化历史。
- `/api/releases?stream=...&page=1`：每页 30 个提交。
- `/api/compare?from=...&to=...`：同来源任意双版本差异。
- `/api/decks?q=...&card=...&kind=...&page=1&limit=12`：分页卡组。
- `/api/decks?ids=hash1,hash2`：收藏批量，最多 60 个 ID。
- `/api/health`：D1 连通性。

读接口无用户登录；收藏保存在浏览器，不提供跨设备同步。

`/api/deck-builder` 提供配卡收藏册，字段包括基础 ID、中文名/英文名、图片、圣水、类型、稀有度、目录支持形态。`local:<UUID>` 自配卡组仅在浏览器保存，不能用于公共 `/api/decks?ids=…` 查询，也不通过入库接口发布。前端 `Deck` 的 `name` 和 `slot_order: explicit` 用于本地用户配置；它们不改变公共 deck ingest 合同或收藏身份算法。
