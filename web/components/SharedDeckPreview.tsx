import type { SharedDeck } from "../../shared/deck-share";
import { createPersonalDeck, validateDraft, type BuilderCard, type PersonalDeck } from "../../shared/personal-decks";
import { Modal, Notice } from "./Common";
import { DeckSlots } from "./DeckSlots";
import { TowerTroop } from "./TowerTroop";

export function SharedDeckPreview({ deck, error, cards, loading, retry, full, close, save }: {
  deck: SharedDeck | null;
  error: string;
  cards: BuilderCard[] | undefined;
  loading: boolean;
  retry: () => void;
  full: boolean;
  close: () => void;
  save: (deck: PersonalDeck) => void;
}) {
  const dictionary = Object.fromEntries((cards ?? []).map((card) => [card.id, card]));
  const invalid = deck && cards ? validateDraft(deck.slots, dictionary) : null;
  return <Modal title="分享的卡组" close={close}>
    {error && <p className="notice error" role="alert">{error}</p>}
    {deck && <>
      <h2>{deck.name}</h2>
      <DeckSlots slots={deck.slots} cards={dictionary} preserveOrder context="detail" />
      <TowerTroop value={deck.tower_troop} />
      <p className="scope-note">保留原卡牌顺序、觉醒／精英形态和塔兵。保存后会添加一套新卡组。</p>
      {loading && <p role="status">正在核对卡牌资料…</p>}
      {!loading && !cards && !error && <Notice error="卡牌资料加载失败，重试后可保存。" retry={retry} />}
      {invalid && <p className="notice error" role="alert">{invalid} 为保留原配置，请稍后重试或联系分享者重新导出。</p>}
      {full && <p role="status">我的卡组已满，请先删除一套卡组后再保存。</p>}
      <div className="detail-actions">
        <button className="primary" disabled={loading || !cards || Boolean(invalid) || full || Boolean(error)}
          onClick={() => save(createPersonalDeck(deck.name, deck.slots, dictionary, undefined, deck.tower_troop))}>
          保存到我的卡组
        </button>
        <button onClick={close}>关闭</button>
      </div>
    </>}
  </Modal>;
}
