# 皇室档案 · Royale Atlas

国际服皇室战争资料站：卡组图片、基础导入链接、卡牌参数、类似 Git 的快照历史与双版本差异。参考 `clash-of-clans` 的技术结构，使用 **React + TypeScript + Cloudflare Workers / Hono + D1 + 独立 Python 采集器**。

已实现卡组搜索/类型/包含卡牌筛选、分页、浏览器收藏、出处详情；卡牌图鉴、组件参数、来源等级索引；不可变 commit、parent、内容 SHA-256、逐字段 before/after、变化百分比与 JSON 导出；条件请求、原始档案、幂等发布和可恢复 outbox。

**数据覆盖尚未达到全部卡组和当前完整参数。** 本轮真实抓取：历史归档 3 个参数版本（112 / 119 / 120 张卡牌）、160 条有效预设观察，近期社区样本 123 张卡牌和 12 套组成。按组成及形态去重后本地共 169 套卡组。历史参数上游最后更新于 2023 年；社区来源不提供 HP/伤害且合并形态。页面明确标注来源日期与覆盖，不用采集时间冒充最新平衡版本。

官方 API 目录和指定玩家卡组适配器已实现，需密钥和固定出口 IP，尚未做联网验证。最新完整参数通过可替换的规范化 feed 接入，目前需要补齐可靠来源。国际服基础导入链接尚未经过游戏内验证；国服预留扩展但尚未实现。

## 运行

Node 22.12+、Python 3.12+、uv：

```bash
npm ci
uv sync --directory crawler --frozen
npm run build
npm run db:migrate
# 设置本地 .dev.vars 的 INGEST_TOKEN，然后启动：
npm run preview
# 另一个终端，通过相同入库 API 导入仓库附带的真实来源快照：
npm run db:seed
```

打开 [本地站点](http://localhost:8787)。热更新可另开 `npm run dev`。重新抓公开来源：

```bash
uv run --directory crawler --frozen python -m arena --source community
uv run --directory crawler --frozen python -m arena --source archive --history 3
```

未设置 ARENA_API_URL 时只写本地文件；设置时需提供 INGEST_TOKEN 并会发布。首次历史引导按从旧到新入库；已有较新 head 的流不能直接追加更老快照。

## 文档与验证

- [架构、数据模型与扩展顺序](docs/architecture.md)
- [Cloudflare 部署与维护手册](docs/deployment.md)
- [采集与 API 数据合同](docs/data-contract.md)
- [RoyaleAPI 网页 JSON 导出：188 条形态目录与 21 项平衡变更](docs/royaleapi-web.md)
- [本轮验证记录](docs/validation.md)

```bash
npm run build
npm test
npm run test:integration
uv run --directory crawler --frozen pytest
```

GitHub 工作流包括检查、每天北京时间 08:17 公开来源采集、手动 Cloudflare 部署。线上任务需推送仓库并配置 production environment 后才生效。仓库 D1 ID 为占位值，部署前创建自己的 D1 并配置 secrets；当前无生产上线承诺。

游戏内容与素材归 Supercell 等权利人。本项目独立于 Supercell。来源：[RoyaleAPI 历史参数](https://github.com/RoyaleAPI/cr-api-data)、[CR Data 社区样本](https://github.com/jayclim/CR-Data)、[官方开发者入口](https://developer.clashroyale.com/)。
