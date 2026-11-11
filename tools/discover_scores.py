"""Build a reviewable keyboard-score shortlist; never import assets."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urljoin, urlsplit, urlencode, parse_qs
from urllib.request import Request, build_opener, HTTPRedirectHandler

BASE = 'https://www.mutopiaproject.org/'
HOSTS = {'www.mutopiaproject.org', 'mutopiaproject.org'}
MAX_BYTES = 2_000_000


def source_url(value, base=BASE):
    url = urlsplit(urljoin(base, value))
    if url.scheme not in ('https', 'http') or url.hostname not in HOSTS or url.username or url.password or url.port not in (None, 80, 443):
        return None
    return url._replace(scheme='https', netloc='www.mutopiaproject.org').geturl()


class SourceRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        safe = source_url(newurl)
        if not safe:
            raise ValueError('Catalogue redirected outside its source host')
        return super().redirect_request(request, fp, code, message, headers, safe)


def fetch(url):
    safe = source_url(url)
    if not safe:
        raise ValueError('Unsupported source URL')
    request = Request(safe, headers={'User-Agent': 'PianoSightReader/0.1 (metadata shortlist; no assets)'})
    with build_opener(SourceRedirects()).open(request, timeout=15) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('Catalogue page exceeds size limit')
        return data.decode('utf-8')


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.frames = []
        self.parts = {'h2': [], 'h4': [], 'td': [], 'a': []}
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag in self.parts:
            self.frames.append([tag, dict(attrs), []])

    def handle_data(self, data):
        for frame in self.frames:
            frame[2].append(data)

    def handle_endtag(self, tag):
        for index in range(len(self.frames)-1, -1, -1):
            if self.frames[index][0] == tag:
                _, attrs, texts = self.frames.pop(index)
                self.parts[tag].append((attrs, ' '.join(''.join(texts).split())))
                break

    @property
    def links(self):
        return [(attrs.get('href', ''), text) for attrs, text in self.parts['a']]


def piece_links(page, url):
    result = []
    for href, _ in page.links:
        safe = source_url(href, url)
        if safe and urlsplit(safe).path == '/cgibin/piece-info.cgi' and re.fullmatch(r'[0-9]+', parse_qs(urlsplit(safe).query).get('id', [''])[0]):
            if safe not in result:
                result.append(safe)
    return result


def candidate(text, url, retrieved, include_by_sa_4=False):
    page = Page(text)
    fields = {}
    for _, cell in page.parts['td']:
        if ':' in cell:
            key, value = cell.split(':', 1)
            fields.setdefault(key.strip(), value.strip())
    title = page.parts['h2'][0][1] if page.parts['h2'] else ''
    composer = page.parts['h4'][0][1].removeprefix('by ') if page.parts['h4'] else ''
    label = fields.get('Copyright', '')
    license_url = None
    for href, link_text in page.links:
        resolved = urljoin(url, href)
        parsed = urlsplit(resolved)
        if label == 'Public Domain' and link_text == label and source_url(resolved) == BASE+'legal.html#publicdomain':
            license_url = BASE+'legal.html#publicdomain'
        if label in ('CC0', 'CC0 1.0', 'Creative Commons Zero') and parsed.hostname == 'creativecommons.org' and parsed.path.rstrip('/') == '/publicdomain/zero/1.0' and parsed.scheme in ('http', 'https'):
            license_url = 'https://creativecommons.org/publicdomain/zero/1.0/'
        if include_by_sa_4 and label == 'Creative Commons Attribution-ShareAlike 4.0' and parsed.hostname == 'creativecommons.org' and parsed.path.rstrip('/') == '/licenses/by-sa/4.0' and parsed.scheme in ('http', 'https'):
            license_url = 'https://creativecommons.org/licenses/by-sa/4.0/'
    if not license_url:
        return None, 'Licence requires separate review: '+(label or 'missing')
    instruments = [part.strip().casefold() for part in fields.get('Instrument(s)', '').split(',')]
    if not instruments or len(instruments) != len(set(instruments)) or not set(instruments) <= {'piano', 'pianoforte', 'harpsichord', 'clavichord'}:
        return None, 'Not explicitly solo keyboard'
    assets = []
    for href, description in page.links:
        safe = source_url(href, url)
        if not safe or not urlsplit(safe).path.startswith('/ftp/'):
            continue
        path = urlsplit(safe).path.lower()
        kind = 'midi' if path.endswith(('.mid', '.midi')) else 'midi-archive' if path.endswith('-mids.zip') else 'source' if path.endswith(('.ly', '-lys.zip')) else 'pdf' if path.endswith('.pdf') else None
        if kind:
            assets.append({'kind': kind, 'url': safe, 'description': description})
    if not title or not composer or not fields.get('Source') or not any(asset['kind'] in ('midi', 'midi-archive') for asset in assets):
        return None, 'Incomplete title/composer/edition/MIDI metadata'
    return {'id': 'mutopia:'+parse_qs(urlsplit(url).query)['id'][0], 'title': title,
            'composer': composer, 'instrument': fields['Instrument(s)'], 'style': fields.get('Style', ''),
            'source_page': url, 'edition': fields['Source'], 'contributor': fields.get('Maintainer', ''),
            'licence': {'label': label, 'url': license_url, 'evidence': 'Copyright: '+label},
            'retrieved_utc': retrieved, 'metadata_sha256': sha256(text.encode('utf-8')).hexdigest(),
            'assets': assets, 'review_required': True}, None


def discover(composer='', limit=8, max_review=30, load=fetch, delay=time.sleep, include_by_sa_4=False):
    listing = BASE+'cgibin/make-table.cgi?'+urlencode({'Instrument': 'Piano', 'Composer': composer})
    url, seen_pages, seen_pieces = listing, set(), set()
    result = {'version': 1, 'source': 'Mutopia Project', 'catalogue_url': listing,
              'policy': 'Only explicit public-domain/CC0 candidates; review edition, asset and jurisdiction before bundling. Other licences are omitted, not declared incompatible.',
              'retrieved_utc': datetime.now(timezone.utc).isoformat(), 'candidates': [], 'skipped': [], 'errors': []}
    if include_by_sa_4:
        result['policy'] += ' Explicit opt-in also includes CC BY-SA 4.0 candidates; retain attribution, share-alike terms and full licence in the separate asset review.'
    while url and url not in seen_pages and len(seen_pages) < 20 and len(seen_pieces) < max_review:
        seen_pages.add(url)
        page = Page(load(url))
        for piece in piece_links(page, url):
            if piece in seen_pieces:
                continue
            if len(seen_pieces) >= max_review:
                break
            seen_pieces.add(piece)
            delay(.15)
            try:
                item, reason = candidate(load(piece), piece, result['retrieved_utc'], include_by_sa_4)
                if item:
                    result['candidates'].append(item)
                else:
                    result['skipped'].append({'url': piece, 'reason': reason})
            except (OSError, ValueError) as error:
                result['errors'].append({'url': piece, 'error': str(error)})
            if len(result['candidates']) >= limit:
                break
        if len(result['candidates']) >= limit:
            break
        url = next((source_url(href, url) for href, label in page.links if label.startswith('Next ') and source_url(href, url) and urlsplit(source_url(href, url)).path == '/cgibin/make-table.cgi'), None)
        if url:
            delay(.15)
    result['reviewed'] = len(seen_pieces)
    return result


def markdown(report):
    def plain(value):
        return str(value).replace('[', '').replace(']', '').replace('\n', ' ')
    lines = ['# Piano-score shortlist', '', report['policy'], '']
    for index, item in enumerate(report['candidates'], 1):
        lines += [f"{index}. **{plain(item['title'])}** — {plain(item['composer'])}",
                  f"   - Edition: {plain(item['edition'])}; contributor: {plain(item['contributor'])}",
                  f"   - [Source page]({item['source_page']}); [{plain(item['licence']['label'])}]({item['licence']['url']})"]
        for asset in item['assets']:
            lines.append(f"   - [{asset['kind']}]({asset['url']})")
        lines.append('')
    lines += [f"Reviewed: {report['reviewed']}; shortlisted: {len(report['candidates'])}; omitted: {len(report['skipped'])}; errors: {len(report['errors'])}.",
              '', 'No score files were downloaded or imported. Licence evidence is metadata, not a completed redistribution review.']
    return '\n'.join(lines)+'\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--composer', default='', help='Mutopia composer code, e.g. ChopinFF, BachJS, MozartWA')
    parser.add_argument('--include-by-sa-4', action='store_true', help='Also shortlist explicit CC BY-SA 4.0 assets for separate licence/attribution review')
    parser.add_argument('--limit', type=int, default=8)
    parser.add_argument('--max-review', type=int, default=30)
    parser.add_argument('--output', type=Path, default=Path('score-shortlists/mutopia.json'))
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[A-Za-z0-9_-]{0,80}', args.composer) or not 1 <= args.limit <= args.max_review <= 100:
        parser.error('Use a composer code and 1 <= limit <= max-review <= 100')
    try:
        report = discover(args.composer, args.limit, args.max_review, include_by_sa_4=args.include_by_sa_4)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n', encoding='utf-8', newline='\n')
        args.output.with_suffix('.md').write_text(markdown(report), encoding='utf-8', newline='\n')
    except (OSError, ValueError) as error:
        print('Discovery failed: '+str(error), file=sys.stderr)
        return 1
    print(f"Shortlisted {len(report['candidates'])} / {report['reviewed']} reviewed; {len(report['errors'])} errors. {args.output.with_suffix('.md')}")
    return 0 if report['candidates'] and not report['errors'] else 1


if __name__ == '__main__':
    sys.exit(main())
