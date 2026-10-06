// Pagina "Informazioni": si legge in 30 secondi e ogni concetto compare una sola volta.
// Cosa fa, come si usa (3 passi), i dati, domande frequenti chiuse, e in fondo un unico blocco legale
// con il testo ufficiale della Fan Content Policy (in inglese, alla lettera, uguale in tutte le lingue).
// Le spiegazioni tecniche (deduplica, fonte, pipeline) stanno nel README.

import { t, tNodes, type Key } from '../i18n';
import type { Data } from '../lib/data';
import { h, svg } from '../lib/dom';
import { fmtDate } from '../lib/format';

export const SITE_TITLE = 'Pauper Index';
// Testo esatto richiesto da company.wizards.com/en/legal/fancontentpolicy (verificato il 2026-10-05).
export const FCP_NOTICE = `${SITE_TITLE} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;
export const REPORT_EMAIL = 'massadalbe@hotmail.com';
// Solo un link semplice: nessuno script o widget esterno (CSP invariata).
export const DONATE_URL = 'https://ko-fi.com/pauperindex';

const ext = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

// Icone dei passi: semplici e originali, linee in currentColor.
const ICONS: Record<string, string[]> = {
  // vassoio con freccia verso l'alto: carica
  step1: ['M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3', 'M12 4v11', 'M7.5 8.5 12 4l4.5 4.5'],
  // cursori: filtri
  step2: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 5v4', 'M9 15v4'],
  // carta con spunta: le tue carte
  step3: ['M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9.5 12.5l2 2 3.5-4'],
};

function icon(name: string): SVGElement {
  return svg('svg', { class: 'step-ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    ...ICONS[name].map((d) => svg('path', { d })));
}

function faq(key: string, answer: (Node | string)[]): HTMLElement {
  return h('details', { class: 'faq' },
    h('summary', null, t(`about.faq.${key}.q` as Key)),
    h('p', null, ...answer));
}

export function renderAbout(root: HTMLElement, d: Data | null): void {
  const m = d?.meta;
  const summary = t('about.legal.summary');
  const mail = h('a', { href: `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(t('about.report.subject'))}` }, REPORT_EMAIL);
  const steps = (['step1', 'step2', 'step3'] as const).map((s, i) => h('li', { class: 'step' },
    h('span', { class: 'step-badge' }, icon(s), h('span', { class: 'step-n' }, String(i + 1))),
    h('span', { class: 'step-body' },
      h('strong', null, t(`about.${s}.title` as Key)),
      h('span', null, t(`about.${s}.text` as Key)))));

  root.replaceChildren(h('article', { class: 'about' },
    h('h2', null, t('about.title')),
    h('p', { class: 'about-lead' }, t('about.intro')),

    h('section', null, h('h3', null, t('about.how')), h('ol', { class: 'steps' }, ...steps)),

    h('section', null,
      h('h3', null, t('about.data')),
      h('p', null, m ? t('about.data.text', { date: fmtDate(m.generated_at) }) : t('about.data.textNoDate'))),

    h('section', null,
      h('h3', null, t('about.faq')),
      faq('played', [t('about.faq.played.a')]),
      faq('precision', [t('about.faq.precision.a')]),
      faq('privacy', [t('about.faq.privacy.a')]),
      faq('report', tNodes('about.faq.report.a', { email: mail })),
      faq('support', tNodes('about.faq.support.a', { link: ext(DONATE_URL, t('donate.link')) }))),

    h('p', { class: 'about-back' }, h('a', { href: '#' }, t('about.back'))),

    h('div', { class: 'legal' },
      h('p', { lang: 'en', id: 'fcp' }, FCP_NOTICE),
      summary ? h('p', null, summary) : null,
      h('p', null, t('about.legal.affiliation')),
      h('p', null, ...tNodes('about.legal.credits', {
        scryfall: ext('https://scryfall.com', 'Scryfall'),
        cache: ext('https://github.com/Jiliac/MTGODecklistCache', 'MTGODecklistCache'),
      }))),
  ));
}
