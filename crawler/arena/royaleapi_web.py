"""Export public RoyaleAPI HTML / browser DOM captures without inventing missing stats."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

from arena.publish import atomic_json


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return ' '.join(''.join(c if isinstance(c, str) else c.text() + ' ' for c in self.children).split())

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def has_class(self, name):
        return name in self.attrs.get('class', '').split()


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def validate_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'royaleapi.com' or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError('Expected an HTTPS royaleapi.com URL without credentials')
    return url


def capture_html(html, url, observed_at):
    if 'cf-chl-' in html or '<title>Just a moment' in html:
        raise ValueError('Cloudflare challenge: no card data extracted')
    root = Document(html).root
    nodes = list(root.walk())
    capture = {'source_url': validate_url(url), 'observed_at': observed_at,
               'source_updated_at': None, 'cards': [], 'tables': []}
    section = None
    for node in nodes:
        if node.tag == 'h2':
            section = [node.attrs.get('id'), node.text()]
        if node.has_class('grid_item') and node.attrs.get('data-card'):
            name = next((n.text() for n in node.walk() if n.has_class('card_name')), None)
            capture['cards'].append({'key': node.attrs['data-card'], 'name': name,
                                     'type': node.attrs.get('data-type'), 'rarity': node.attrs.get('data-rarity')})
        if node.tag == 'table' and node.has_class('balance_table'):
            image = next((n.attrs.get('src', '') for n in node.walk() if n.tag == 'img'), '')
            key = Path(urlparse(image).path).stem
            rows = [[n.text() for n in row.walk() if n.tag == 'td']
                    for row in node.walk() if row.tag == 'tr']
            capture['tables'].append({'key': key, 'section': section, 'rows': [r for r in rows if r]})
        if node.has_class('card_header'):
            name = next((n.text() for n in node.walk() if n.tag == 'h1'), None)
            elixir = re.search(r'Elixir:\s*(\d+)', node.text())
            capture['cards'].append({'key': urlparse(url).path.rstrip('/').split('/')[-1], 'name': name,
                                     'elixir': int(elixir[1]) if elixir else None})
    return capture


def identity(key):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key or ''):
        raise ValueError(f'Invalid card key: {key!r}')
    match = re.search(r'-ev\d+$', key)
    if match:
        return key[:match.start()], 'evolution'
    if key.endswith('-hero'):
        return key[:-5], 'hero'
    return key, 'normal'


UNITS = {'Hit Points': 'hitpoints', 'HP': 'hitpoints', 'Seconds': 'seconds',
         'Tiles': 'tiles', 'Hits / Second': 'hits_per_second', 'Elixir / Second': 'elixir_per_second'}


def quantity(raw):
    match = re.fullmatch(r'([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s+(.+)', raw)
    if not match or match[2] not in UNITS:
        raise ValueError(f'Unknown value/unit, review source: {raw!r}')
    number = match[1].replace(',', '')
    return {'value': float(number) if '.' in number else int(number), 'unit': UNITS[match[2]], 'raw': raw}


def normalize(capture):
    url = validate_url(capture['source_url'])
    observed_at = capture['observed_at']
    if datetime.fromisoformat(observed_at.replace('Z', '+00:00')).tzinfo is None:
        raise ValueError('observed_at must include a timezone')
    result = {'schema_version': 1, 'source': 'royaleapi_website', 'source_url': url,
              'observed_at': observed_at, 'source_updated_at': capture.get('source_updated_at'),
              'published_on': capture.get('published_on'), 'effective_at': None,
              'live_version_verified': False, 'complete_combat_parameters': False,
              'cards': [], 'balance_changes': []}
    seen = set()
    for row in capture.get('cards', []):
        key = row['key']
        base, variant = identity(key)
        if key in seen or not row.get('name'):
            raise ValueError(f'Duplicate card or missing name: {key}')
        seen.add(key)
        elixir = row.get('elixir')
        if elixir is not None and (type(elixir) is not int or not 0 <= elixir <= 10):
            raise ValueError(f'Invalid elixir: {key}')
        result['cards'].append({'key': key, 'base_key': base, 'variant': variant,
                                'name': row['name'], 'type': row.get('type'), 'rarity': row.get('rarity'),
                                'official_id': None, 'elixir': elixir,
                                'combat_stats': None, 'source_url': 'https://royaleapi.com/card/' + key})
    seen_changes = set()
    for table in capture.get('tables', []):
        key = table['key']
        base, variant = identity(key)
        section = table.get('section')
        if not section or len(section) != 2 or not section[0]:
            raise ValueError('Balance table is missing its section heading')
        for row in table['rows']:
            if len(row) != 3:
                raise ValueError(f'Expected 3 table cells: {row!r}')
            metric = re.fullmatch(r'(.*?)(?:\s+([+-]?\d+(?:\.\d+)?%))?', row[0])
            before, after = quantity(row[1]), quantity(row[2])
            if before['unit'] != after['unit']:
                raise ValueError('Before and after units differ')
            label, percent = metric.groups()
            metric_key = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')
            if label == 'Hit Speed' and before['unit'] == 'hits_per_second':
                metric_key = 'hit_rate'
            change_key = (key, metric_key, section[0])
            if change_key in seen_changes:
                raise ValueError(f'Duplicate change: {change_key}')
            seen_changes.add(change_key)
            result['balance_changes'].append({'key': key, 'base_key': base, 'variant': variant,
                'metric': metric_key, 'source_label': label, 'source_change_percent': percent,
                'before': before, 'after': after, 'level': None, 'section_title': section[1],
                'source_url': url.split('#')[0] + '#' + section[0]})
    if not result['cards'] and not result['balance_changes']:
        raise ValueError('No recognized data: blocked page or site layout changed; output was not written')
    result['coverage'] = {'card_variants': len(result['cards']),
                          'balance_cards': len({r['key'] for r in result['balance_changes']}),
                          'balance_rows': len(result['balance_changes'])}
    return result


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_html(url):
    """One public page, no cookies, challenge bypass or retries; honor robots delay."""
    validate_url(url)
    agent = 'RoyaleAtlasResearch/0.1'
    opener = build_opener(NoRedirect)

    def get(target):
        with opener.open(Request(target, headers={'User-Agent': agent, 'Accept': 'text/html,text/plain'}), timeout=30) as response:
            data = response.read(10_000_001)
            if len(data) > 10_000_000:
                raise ValueError('Page exceeds 10 MB limit')
            return data.decode('utf-8')

    robots = RobotFileParser()
    robots.parse(get('https://royaleapi.com/robots.txt').splitlines())
    if not robots.can_fetch(agent, url):
        raise ValueError('robots.txt disallows this URL')
    delay = max(60, robots.crawl_delay(agent) or 0)
    # Each invocation waits after reading robots, including separate process runs.
    # Sleep in short segments so interruption remains responsive.
    for _ in range(delay):
        time.sleep(1)
    return get(url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--capture', type=Path, help='JSON from scripts/royaleapi-dom-export.js')
    source.add_argument('--html', type=Path, help='Locally saved public page HTML')
    source.add_argument('--fetch', action='store_true', help='Fetch one URL (may return Cloudflare 403)')
    parser.add_argument('--url', help='Required for --html / --fetch')
    parser.add_argument('--observed-at', help='Required for --html; actual capture time in ISO 8601')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.capture:
            capture = json.loads(args.capture.read_text(encoding='utf-8'))
        else:
            if not args.url or (args.html and not args.observed_at):
                parser.error('--url and, for saved HTML, --observed-at are required')
            html = args.html.read_text(encoding='utf-8') if args.html else fetch_html(args.url)
            timestamp = args.observed_at or datetime.now(timezone.utc).isoformat()
            capture = capture_html(html, args.url, timestamp)
        result = normalize(capture)
        atomic_json(args.out, result)
        print(json.dumps({'output': str(args.out), **result['coverage']}))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Export failed; previous output retained: {error}\n')


if __name__ == '__main__':
    main()
