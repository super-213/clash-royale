import { z } from "zod";

// Tower identities are recorded in data/royaleapi-web/catalog.json, separately
// from the eight playable cards. No combat parameters are stored here.
export const towerTroopSchema = z.enum([
  "tower-princess",
  "cannoneer",
  "dagger-duchess",
  "royal-chef",
]);
export type TowerTroopKey = z.infer<typeof towerTroopSchema>;
export const DEFAULT_TOWER_TROOP: TowerTroopKey = "tower-princess";
export const towerTroops = [
  { key: "tower-princess", name: "公主塔", name_en: "Tower Princess" },
  { key: "cannoneer", name: "加农炮手", name_en: "Cannoneer" },
  { key: "dagger-duchess", name: "飞刀女爵", name_en: "Dagger Duchess" },
  { key: "royal-chef", name: "皇家厨师", name_en: "Royal Chef" },
].map((troop) => ({
  ...troop,
  key: towerTroopSchema.parse(troop.key),
  image_url: `https://cdns3.royaleapi.com/cdn-cgi/image/w=150,h=180,format=auto/static/img/cards/v11-a8e42334/${troop.key}.png`,
}));
export function towerTroopInfo(key: TowerTroopKey) {
  return towerTroops.find((troop) => troop.key === key)!;
}
