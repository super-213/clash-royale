import type { Slot } from "../../shared/schema";
import {
  layoutDeck,
  slotHelp,
  slotNames,
  type DeckCard,
  cardForForm,
} from "../../shared/deck-layout";
import { Picture } from "./Common";

export function DeckSlots({
  slots,
  cards,
  context = "library",
  preserveOrder = false,
}: {
  slots: Slot[];
  cards: Record<number, DeckCard>;
  context?: "library" | "detail" | "brief";
  preserveOrder?: boolean;
}) {
  const layout = layoutDeck(slots, cards, { preserveOrder });
  return (
    <div className={`deck-layout deck-layout--${context}`}>
      <div
        className="deck-slot-grid"
        role="group"
        aria-label="卡组槽位，两行四列"
      >
        {layout.cells.map((cell) => {
          const card = cards[cell.slot.id];
          const showSlot = preserveOrder || cell.active || cell.conflict;
          const displayKind = showSlot ? cell.kind : "regular";
          return (
            <div
              key={cell.slot.id}
              className={`deck-slot deck-slot--${displayKind}${cell.active ? " is-active" : ""}${cell.conflict ? " is-conflict" : ""}`}
              data-position={cell.position + 1}
              data-card-id={cell.slot.id}
              data-slot-kind={displayKind}
              data-variant={cell.slot.variant}
              aria-label={`${card?.name ?? cell.slot.id} · ${cell.formLabel}`}
              title={
                showSlot
                  ? `第 ${cell.position + 1} 槽 · ${slotNames[cell.kind]}：${slotHelp[cell.kind]} 当前记录：${cell.formLabel}${cell.conflict ? "，与当前槽位规则冲突" : ""}。`
                  : `原始组成第 ${cell.position + 1} 张 · ${cell.formLabel}，未确认特殊槽位配置。`
              }
            >
              <div className="deck-slot-frame">
                <Picture
                  card={
                    cardForForm(card, cell.slot.variant) ?? {
                      name: String(cell.slot.id),
                      image_url: null,
                    }
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
      {layout.conflicts.length > 0 && (
        <p className="deck-slot-conflict" role="status">
          来源记录的特殊形态超出当前槽位容量，请在游戏内调整标记冲突的卡牌。
        </p>
      )}
    </div>
  );
}
