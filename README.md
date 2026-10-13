# 皇室档案 · Royale Atlas

国际服皇室战争卡组资料站：卡组图片、基础导入链接、收藏与自配卡组。参考 `clash-of-clans` 的技术结构，使用 **React + TypeScript + Cloudflare Workers / Hono + D1 + 独立 Python 采集器**。

已实现卡组搜索/类型/包含卡牌筛选、分页、浏览器收藏、出处详情、配卡编辑器；采集支持条件请求、原始档案、幂等发布和可恢复 outbox。

卡牌图鉴/战斗参数、参数历史和双版本差异已下线，旧链接回到卡组页。archive 与参数 feed 采集入口已移除，每月定时采集 community；可选 official 仅提供卡牌基础资料和指定玩家卡组。旧参数 JSON 与数据库历史保留为归档，不再导入、读取展示或生成新差异。

「我的卡组」（`?view=brief`，沿用旧链接）直接管理收藏与自配卡组。公告简报、公告匹配统计与对应接口已移除，不再请求或加载公告数据。

卡组列表、详情和我的卡组统一采用两行四列。来源卡组仅在明确配置特殊形态时显示对应特殊槽；历史普通组成使用中性展示，不给普通卡套特殊槽标签。可点「按当前槽位配卡」保留八张卡生成独立适配草稿，按兼容能力分配觉醒、精英、魔法栏位，确认已解锁的形态后保存。自配卡组保留明确槽序；特殊形态使用对应专属卡图，缺图时显示占位说明。复制基础链接与展示顺序一致，收藏 ID 不变；适配草稿不覆盖来源记录。

「我的卡组」支持独立塔兵配置：默认公主塔，可切换加农炮手、飞刀女爵或皇家厨师，随草稿和卡组保存，在列表与详情展示。旧本地卡组自动补为公主塔；塔兵不占八张卡位、不计入平均圣水。

自配卡组可「复制完整配置链接」，包含名称、八张卡的明确顺序、觉醒／精英形态和塔兵。链接在皇室档案中预览，核对卡牌目录后保存为新卡组；不会覆盖已有卡组，也不会自动整理形态。分享无需后端存储，接收者需能访问链接所在站点（本地开发地址仅适合同机测试）。「打开游戏」仍使用基础卡牌链接，游戏中的特殊形态和塔兵需另行配置。

「我的卡组」支持「新建卡组」：空槽点击收藏册卡牌直接填入并自动前进；替换支持先选卡再点槽位，或先点槽位再选卡，不再额外点「使用／替换」。电脑可从收藏册拖入槽位，也可在卡组内拖动换位；手机以点击为主。新增、替换、换位、移除和形态切换均可撤销上一步；已有卡牌置灰，魔法栏位形态直接切换。保存后可编辑、改名、删除和撤销删除。自配卡组最多 10 套，独立保存在当前浏览器；关闭编辑器保留草稿，刷新后可以继续。自配卡组保留玩家明确选择的槽序，不按来源编排规则重排，也不写入公共卡组库。

**卡组覆盖仍是来源样本。** 仓库保留 160 条历史预设卡组观察，以及社区样本的 123 张卡牌基础资料和 12 套组成。按组成及形态去重后本地共 169 套卡组。历史预设仅作浏览，社区来源合并形态，不代表当前热门排名。

官方 API 目录和指定玩家卡组适配器已实现，需密钥和固定出口 IP，尚未做联网验证。国际服基础导入链接尚未经过游戏内验证；国服预留扩展但尚未实现。

## 运行

Node 22.12+、Python 3.12+、uv：

```bash
npm ci
uv sync --directory crawler --frozen
npm run build
npm run db:migrate
# 设置本地 .dev.vars 的 INGEST_TOKEN，然后启动：
npm run preview
# 另一个终端，通过相同入库 API 导入卡牌展示目录及卡组样本：
npm run db:seed
```

打开 [本地站点](http://localhost:8787)。热更新可另开 `npm run dev`。重新抓公开来源：

```bash
uv run --directory crawler --frozen python -m arena --source community
```

未设置 ARENA_API_URL 时只写本地文件；设置时需提供 INGEST_TOKEN 并会发布。本地 seed 不再导入 `data/releases/`、`feed.json` 或 archive/feed 的运行记录。

## 文档与验证

- [架构、数据模型与扩展顺序](docs/architecture.md)
- [Cloudflare 部署与维护手册](docs/deployment.md)
- [采集与 API 数据合同](docs/data-contract.md)
- [RoyaleAPI 网页 JSON 导出：188 条形态目录与 21 项平衡变更](docs/royaleapi-web.md)
- [免费额度优化、实际请求数和迁移顺序](docs/query-budget.md)
- [我的卡组：收藏与自配管理](docs/brief.md)
- [本轮验证记录](docs/validation.md)

```bash
npm run build
npm test
npm run test:integration
uv run --directory crawler --frozen pytest
```

GitHub 工作流包括检查、每月 1 日北京时间 08:17 公开来源采集、手动 Cloudflare 部署。线上任务需推送仓库并配置 production environment 后才生效。仓库 D1 ID 为占位值，部署前创建自己的 D1 并配置 secrets；当前无生产上线承诺。

游戏内容与素材归 Supercell 等权利人。本项目独立于 Supercell。来源：[RoyaleAPI 形态目录](https://royaleapi.com/)、[CR Data 社区样本](https://github.com/jayclim/CR-Data)、[官方开发者入口](https://developer.clashroyale.com/)。

配卡规则已按官方中文说明核对：[标准卡组规则与自动排位](docs/deck-rules.md)。英雄牌自动安排，基础卡随栏位切换形态；当前按三个特殊栏位已解锁的标准配置工作，未同步玩家解锁状态。
