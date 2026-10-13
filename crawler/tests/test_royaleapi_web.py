import json
from pathlib import Path
import subprocess
import sys

import pytest

from arena.royaleapi_web import capture_html, fetch_html, normalize, quantity, validate_url


URL = 'https://royaleapi.com/blog/example'
TIME = '2026-10-13T02:59:24Z'
ROOT = Path(__file__).resolve().parents[2]


def test_dom_capture_variants_and_missing_parameters():
    result = normalize({'source_url': URL, 'observed_at': TIME, 'cards': [
        {'key': 'knight', 'name': 'Knight'},
        {'key': 'knight-ev1', 'name': 'Knight Evolution'},
        {'key': 'knight-hero', 'name': 'Hero Knight'},
    ]})
    assert [c['variant'] for c in result['cards']] == ['normal', 'evolution', 'hero']
    assert {c['base_key'] for c in result['cards']} == {'knight'}
    assert all(c['official_id'] is None and c['combat_stats'] is None and c['elixir'] is None for c in result['cards'])
    assert result['source_updated_at'] is None
    assert not result['complete_combat_parameters']


def test_html_table_preserves_rates_rounding_units_and_zero():
    html = '''<h2 id="lava-hound-buff">Lava Hound (Buff)</h2>
    <table class="balance_table"><thead><tr><th><img src="/lava-hound.png"></th><th>Before</th><th>After</th></tr></thead>
    <tbody><tr><td>Hit Speed <i></i> -13%</td><td>0.77 Hits / Second</td><td>0.67 Hits / Second</td></tr>
    <tr><td>Tower Damage</td><td>0 Hit Points</td><td>20 Hit Points</td></tr></tbody></table>'''
    result = normalize(capture_html(html, URL, TIME))
    first, second = result['balance_changes']
    assert first['metric'] == 'hit_rate'
    assert first['before'] == {'value': 0.77, 'unit': 'hits_per_second', 'raw': '0.77 Hits / Second'}
    assert first['source_change_percent'] == '-13%'
    assert first['level'] is None and result['effective_at'] is None
    assert second['before']['value'] == 0 and second['source_change_percent'] is None
    assert first['source_url'].endswith('#lava-hound-buff')
    assert quantity('1,152 Hit Points')['value'] == 1152


def test_html_catalog_and_detail_header():
    grid = '<div class="grid_item" data-card="knight-ev1" data-type="Troop" data-rarity="Common"><span class="card_name">Knight Evolution</span></div>'
    assert normalize(capture_html(grid, URL, TIME))['cards'][0]['rarity'] == 'Common'
    header = '<div class="card_header"><h1>Knight</h1><div>Elixir: 3</div><div>Usage: 7%</div></div>'
    card = normalize(capture_html(header, 'https://royaleapi.com/card/knight', TIME))['cards'][0]
    assert card['elixir'] == 3 and card['combat_stats'] is None


@pytest.mark.parametrize('html', ['<title>Just a moment...</title>', '<script src="/cf-chl-example"></script>', '<html>different layout</html>'])
def test_block_or_layout_drift_is_not_a_successful_empty_export(html):
    with pytest.raises(ValueError):
        normalize(capture_html(html, URL, TIME))


def test_unknown_and_changed_units_require_review():
    with pytest.raises(ValueError):
        quantity('5 Unknown Unit')
    with pytest.raises(ValueError, match='units differ'):
        normalize({'source_url': URL, 'observed_at': TIME, 'tables': [
            {'key': 'knight', 'section': ['knight', 'Knight'], 'rows': [['Damage', '3 HP', '4 Seconds']]}
        ]})


def test_duplicate_card_is_rejected():
    with pytest.raises(ValueError, match='Duplicate'):
        normalize({'source_url': URL, 'observed_at': TIME, 'cards': [{'key': 'knight', 'name': 'Knight'}] * 2})


@pytest.mark.parametrize('url', ['http://royaleapi.com/card/knight', 'https://royaleapi.com.evil.test/', 'https://user@royaleapi.com/'])
def test_source_host_is_restricted(url):
    with pytest.raises(ValueError):
        validate_url(url)


def test_failed_cli_preserves_previous_json(tmp_path):
    html, out = tmp_path / 'blocked.html', tmp_path / 'data.json'
    html.write_text('<title>Just a moment...</title>')
    out.write_text('{"previous":true}')
    process = subprocess.run([sys.executable, '-m', 'arena.royaleapi_web', '--html', str(html),
        '--url', URL, '--observed-at', TIME, '--out', str(out)], cwd=ROOT / 'crawler', capture_output=True)
    assert process.returncode == 1
    assert json.loads(out.read_text()) == {'previous': True}


def test_http_respects_robots_without_requesting_disallowed_page(monkeypatch):
    requested = []

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, size): return b'User-agent: *\nDisallow: /decks/random\nCrawl-delay: 60\n'

    class Opener:
        def open(self, request, timeout):
            requested.append(request.full_url)
            return Response()

    monkeypatch.setattr('arena.royaleapi_web.build_opener', lambda *args: Opener())
    with pytest.raises(ValueError, match='disallows'):
        fetch_html('https://royaleapi.com/decks/random')
    assert requested == ['https://royaleapi.com/robots.txt']


def test_http_waits_and_stops_at_403_without_retry(monkeypatch):
    from urllib.error import HTTPError
    requested, sleeps = [], []

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, size): return b'User-agent: *\nCrawl-delay: 60\n'

    class Opener:
        def open(self, request, timeout):
            requested.append(request.full_url)
            if len(requested) == 1: return Response()
            raise HTTPError(request.full_url, 403, 'Forbidden', {}, None)

    monkeypatch.setattr('arena.royaleapi_web.build_opener', lambda *args: Opener())
    monkeypatch.setattr('arena.royaleapi_web.time.sleep', sleeps.append)
    with pytest.raises(HTTPError): fetch_html('https://royaleapi.com/card/knight')
    assert len(requested) == 2 and sum(sleeps) == 60


def test_saved_website_captures_reproduce_exports():
    for capture_file, output_file, counts in [
        ('catalog-2026-10-13.json', 'catalog.json', (188, 0, 0)),
        ('balance-2026-10.json', 'balance-2026-10.json', (0, 17, 21)),
    ]:
        base = ROOT / 'data/royaleapi-web'
        exported = normalize(json.loads((base / 'captures' / capture_file).read_text()))
        assert exported == json.loads((base / output_file).read_text())
        assert tuple(exported['coverage'].values()) == counts
        assert all(c['level'] is None for c in exported['balance_changes'])
