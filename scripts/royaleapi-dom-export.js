// Run on a normally loaded public RoyaleAPI page in the browser console.
// Read-only: no network calls, cookies, hidden app state, or page mutations.
// Save the returned object as JSON, then normalize with arena.royaleapi_web.
(() => {
  const clean = (element) => element?.textContent.replace(/\s+/g, ' ').trim() ?? null;
  const capture = {
    source_url: location.href,
    observed_at: new Date().toISOString(),
    source_updated_at: null,
    cards: [...document.querySelectorAll('.grid_item[data-card]')].map(element => ({
      key: element.getAttribute('data-card'),
      name: clean(element.querySelector('.card_name')),
      type: element.getAttribute('data-type'),
      rarity: element.getAttribute('data-rarity'),
    })),
    tables: [],
  };
  const header = document.querySelector('.card_header');
  if (header) {
    const elixir = clean(header).match(/Elixir:\s*(\d+)/);
    capture.cards.push({
      key: location.pathname.split('/').filter(Boolean).pop(),
      name: clean(header.querySelector('h1')),
      elixir: elixir ? Number(elixir[1]) : null,
    });
  }
  let section = null;
  for (const element of document.querySelectorAll('h2,table.balance_table')) {
    if (element.tagName === 'H2') { section = [element.id, clean(element)]; continue; }
    const src = element.querySelector('img')?.getAttribute('src') ?? '';
    capture.tables.push({
      key: src.split('/').pop().replace(/\.png.*$/, ''),
      section,
      rows: [...element.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(clean)),
    });
  }
  return capture;
})();
