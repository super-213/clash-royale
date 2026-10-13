import type { Release } from "../shared/schema";
export const names = {
  brief: "我的卡组",
  decks: "卡组",
  sources: "数据来源",
};
export const typeName: Record<string, string> = {
  Troop: "军队",
  Building: "建筑",
  Spell: "法术",
  Other: "其他",
};
export const rarityName: Record<string, string> = {
  Common: "普通",
  Rare: "稀有",
  Epic: "史诗",
  Legendary: "传奇",
  Champion: "英雄",
};
export const streamName: Record<string, string> = {
  "supercell-api": "Supercell 官方目录",
  "cr-data-community": "CR Data 社区样本",
};
export const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "—";
export const stale = (r?: Release) =>
  !!r &&
  Date.now() - Date.parse(r.latest_source_updated_at ?? r.source_updated_at) >
    45 * 86400000;
