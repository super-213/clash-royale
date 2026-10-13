import type { Release } from "../shared/schema";
export const names = {
  brief: "主卡组简报",
  decks: "卡组资料库",
  cards: "卡牌图鉴",
  balance: "平衡调整",
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
  "royaleapi-archive": "RoyaleAPI 历史归档",
  "supercell-api": "Supercell 官方目录",
  "cr-data-community": "CR Data 社区样本",
};
export const fieldName: Record<string, string> = {
  hitpoints: "生命值",
  damage: "伤害",
  dps: "每秒伤害",
  hit_speed: "攻击间隔",
  range: "射程",
  speed: "移动速度",
  elixir: "圣水消耗",
  mana_cost: "圣水消耗",
  deploy_time: "部署时间",
  shield_hitpoints: "护盾生命值",
  hitpoints_per_level: "各等级生命值",
  damage_per_level: "各等级伤害",
  dps_per_level: "各等级每秒伤害",
  load_time: "首次攻击延迟",
  radius: "半径",
  crown_tower_damage_percent: "皇冠塔伤害系数",
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

export function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function fieldLabel(path: string): string {
  const parts = path.split(".");
  const key = parts.at(-1)!;
  if (/^\d+$/.test(key)) {
    const name = parts.at(-2)!;
    return `${fieldName[name] ?? name} · 来源索引 ${Number(key) + 1}`;
  }
  return fieldName[key] ?? key;
}
