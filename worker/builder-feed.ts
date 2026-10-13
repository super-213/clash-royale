import directory from "../data/community.json";
import variants from "../data/royaleapi-web/catalog.json";
import names from "../data/card-names-zh.json";
import formImages from "../data/card-form-images.json";
import type { BuilderCard, CardForm } from "../shared/personal-decks";

const chinese: Record<string, string> = names;
const images: Record<
  string,
  Partial<Record<"evolution" | "hero", string>>
> = formImages.images;
export const builderCards: BuilderCard[] = directory.cards.map((card) => ({
  id: card.id,
  key: card.key,
  name: chinese[String(card.id)] ?? card.name,
  name_en: card.name_en,
  image_url: card.image_url,
  elixir: card.elixir,
  rarity: card.rarity,
  type: card.type,
  form_images: images[card.key],
  forms: [
    ...new Set<CardForm>([
      "normal",
      ...variants.cards
        .filter(
          (entry) =>
            entry.base_key === card.key &&
            ["evolution", "hero"].includes(entry.variant),
        )
        .map((entry) => entry.variant as CardForm),
    ]),
  ],
}));
