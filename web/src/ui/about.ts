// Pagina "Informazioni": avviso Fan Content Policy (testo ufficiale in inglese, uguale in tutte le lingue),
// non affiliazione, crediti, limiti dei dati, privacy, segnalazioni.

import { t, tNodes, type Key } from '../i18n';
import type { Data } from '../lib/data';
import { h } from '../lib/dom';
import { fmtDate, fmtInt } from '../lib/format';

export const SITE_TITLE = 'Pauper Index';
// Testo esatto richiesto da company.wizards.com/en/legal/fancontentpolicy (verificato il 2026-10-05).
export const FCP_NOTICE = `${SITE_TITLE} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;
export const REPORT_EMAIL = 'massadalbe@hotmail.com';
// Solo un link semplice: nessuno script o widget esterno (CSP invariata).
export const DONATE_URL = 'https://ko-fi.com/pauperindex';

const ext = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
const items = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => h('li', null, t(`${prefix}.${i + 1}` as Key)));

export function renderAbout(root: HTMLElement, d: Data | null): void {
  const m = d?.meta;
  const translation = t('about.notice.translation');
  const mail = h('a', { href: `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(t('about.report.subject'))}` }, REPORT_EMAIL);
  root.replaceChildren(h('article', { class: 'about' },
    h('h2', null, t('about.title')),
    h('p', null, t('about.intro')),

    h('section', null, h('h3', null, t('about.how')), h('ul', null, ...items('about.how', 7))),

    h('section', null,
      h('h3', null, t('about.notice')),
      h('blockquote', { lang: 'en', id: 'fcp' }, FCP_NOTICE),
      translation ? h('p', null, translation) : null,
      h('p', null, t('about.notice.affiliation'))),

    h('section', null,
      h('h3', null, t('about.credits')),
      h('ul', null,
        h('li', null, ...tNodes('about.credits.1', { scryfall: ext('https://scryfall.com', 'Scryfall') })),
        h('li', null, ...tNodes('about.credits.2', { cache: ext('https://github.com/Jiliac/MTGODecklistCache', 'MTGODecklistCache') })),
        h('li', null, t('about.credits.3')))),

    h('section', null,
      h('h3', null, t('about.limits')),
      h('ul', null, ...items('about.limits', 7)),
      m ? h('p', null, t('about.limits.data', {
        last: fmtDate(m.last_tournament), tournaments: fmtInt(m.tournaments), decks: fmtInt(m.decks),
        generated: fmtDate(m.generated_at), scryfall: fmtDate(m.scryfall.default_cards || ''),
      })) : null),

    h('section', null, h('h3', null, t('about.privacy')), h('ul', null, ...items('about.privacy', 5))),

    h('section', null,
      h('h3', null, t('about.report')),
      h('p', null, ...tNodes('about.report.text', { email: mail }))),

    h('section', null,
      h('h3', null, t('about.support')),
      h('p', null, ...tNodes('about.support.text', { link: ext(DONATE_URL, t('donate.link')) }))),

    h('p', null, h('a', { href: '#' }, t('about.back'))),
  ));
}
