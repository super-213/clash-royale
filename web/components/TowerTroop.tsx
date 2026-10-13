import { towerTroopInfo, type TowerTroopKey } from "../../shared/tower-troops";
import { Picture } from "./Common";

export function TowerTroop({ value }: { value: TowerTroopKey }) {
  const troop = towerTroopInfo(value);
  return (
    <div className="deck-tower" aria-label={`塔兵：${troop.name}`}>
      <Picture card={troop} />
      <div><small>塔兵</small><strong>{troop.name}</strong></div>
    </div>
  );
}
