# RoyaleAPI 网页数据导出

> 当前站点仅使用形态目录与素材。公告简报已移除，本文的公告 JSON 与导出步骤仅保留为历史研究资料，没有定时采集或站点接口接入。

已于 2026-10-13 从正常加载的公开网页 DOM 读取并导出：

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `data/royaleapi-web/catalog.json` | 188 条卡牌及形态记录，含名称、类型、稀有度、形态与详情页链接 | https://royaleapi.com/cards/popular?sort=rating |
| `data/royaleapi-web/balance-2026-10.json` | 17 张卡牌、21 项调整前后数值 | https://royaleapi.com/blog/season-88-balance-final-october-2026 |

这是网页事实的结构化导出，**不是已核实的全量最新战斗参数库**。188 是该目录页面展示的条目数量，包含进化、英雄等形态；不代表 188 张独立基础卡牌，也不保证网站已包含所有游戏对象。

## 数据含义

- `key` 保留网站标识；`base_key` 去掉形态后缀；`variant` 为 `normal`、`evolution`、`hero`。`evN` 的完整标识仍保留在 `key`。
- 目录未提供的 `official_id`、`elixir`、`combat_stats` 为 `null`。详情页若出现 `Elixir: N`，解析器可提取该值。本次目录导出未逐张访问详情页。
- `balance_changes` 保留来源标签、原始百分比、前后值、单位、章节链接。调整表没有明确标注的等级为 `null`，不假定为 11 级。
- `Hit Speed` 表格使用 `Hits / Second` 时，输出 `metric: "hit_rate"`、`unit: "hits_per_second"`。不能作为每次攻击间隔直接使用。原文的舍入值、百分比均保留，不自行修正。
- `observed_at` 是网页采集时间，`published_on` 是人工核对的文章发布日期，`source_updated_at` 未知时为 `null`。解析器不把采集时间当成网站更新时间。
- `effective_at: null`、`live_version_verified: false` 表示没有通过游戏客户端核对正式服版本。文章中的 After 值不能自动认定仍是当前正式服数值。
- `complete_combat_parameters: false` 始终明确覆盖不完整。卡牌详情页主要展示圣水、使用率、卡组；部分战斗参数在文章图片中，本工具不自动 OCR，也不补用旧版本数值。

## 重新生成现有 JSON

在项目根目录运行（Python 环境沿用现有 crawler）：

```sh
uv run --directory crawler --frozen python -m arena.royaleapi_web \
  --capture ../data/royaleapi-web/captures/catalog-2026-10-13.json \
  --out ../data/royaleapi-web/catalog.json

uv run --directory crawler --frozen python -m arena.royaleapi_web \
  --capture ../data/royaleapi-web/captures/balance-2026-10.json \
  --out ../data/royaleapi-web/balance-2026-10.json
```

`captures/` 保存本次浏览器读到的事实字段，便于核对和离线重现，不包含玩家数据、cookie、验证令牌、完整文章或图片。网页发布时间若有人工核对，可在 capture 中增加 `published_on`。

## 采集其他公开页面

普通 HTTP 模式每次读取 robots.txt，遵守允许路径和至少 60 秒间隔；不跟随重定向，不重试 403/429，不导出登录信息。本站此次对普通 HTTP 请求返回 Cloudflare 403，所以该模式目前**不能保证无人值守更新成功**。

```sh
uv run --directory crawler --frozen python -m arena.royaleapi_web \
  --fetch --url 'https://royaleapi.com/card/knight' \
  --out ../data/royaleapi-web/knight.json
```

如果浏览器已正常加载公开页面，可在开发者控制台运行 `scripts/royaleapi-dom-export.js`，将返回对象保存成 capture JSON，再用 `--capture` 导入。不需要任何 cookie、验证令牌或隐藏接口；遇到验证码先停下，由用户自行处理。

也支持本地保存的 HTML（提供实际保存时间）：

```sh
uv run --directory crawler --frozen python -m arena.royaleapi_web \
  --html /tmp/knight.html --url 'https://royaleapi.com/card/knight' \
  --observed-at '2026-10-13T03:00:00Z' \
  --out ../data/royaleapi-web/knight.json
```

仅支持当前观察到的目录、详情页头部、文章 `balance_table` 表格。没有识别到数据、出现新单位、单位不一致或重复条目时直接报错，保留已有输出文件。

这是独立导出格式；没有接入站点的 release 入库接口，也不会因为设置了 `ARENA_API_URL` 而自动上传。现有 release 格式要求官方 ID 和圣水等字段，不能把这里的未知值直接当成完整版本发布。

## 程序读取示例

```python
import json
from pathlib import Path

catalog = json.loads(Path('data/royaleapi-web/catalog.json').read_text())
cards_by_key = {card['key']: card for card in catalog['cards']}
assert cards_by_key['electro-giant-ev1']['variant'] == 'evolution'

balance = json.loads(Path('data/royaleapi-web/balance-2026-10.json').read_text())
changes = [row for row in balance['balance_changes'] if row['key'] == 'lava-hound']
# 每条 change 的 after 为 {value, unit, raw}；它只是这篇文章记录的调整后值。
```

验证：`uv run --directory crawler --frozen pytest`。
