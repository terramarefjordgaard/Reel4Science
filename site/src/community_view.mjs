// Leaderboard section (spec 2.3 LB-01..04 rev, DEC-25, DEC-29/30): prizes inside the table card, one table with three tabs,
// all species, over the shared period (computed in the browser with the publisher's shared code);
// the leaderboard shows 10 rows until expanded; CSV of the active view, every row.
import { el, number, download } from './dom.mjs';
import { views, view_rows } from './community_data.mjs';
import { to_csv, csv_name } from './csv.mjs';
import { community } from '../../shared/analytics.mjs';

const $ = (id) => document.getElementById(id);

// The prize explanations live in leaderboard.md (## headings after the intro): move them into the prize cards
function adopt_prize_texts() {
	const titles = [...document.querySelectorAll('#leaderboard .section-copy h3')];
	['prize-biodiversity', 'prize-conservation'].forEach((id, i) => {
		const h = titles[i];
		if (!h) {
			return;
		}
		const card = $(id);
		const parts = [];
		for (let n = h.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) {
			parts.push(n);
		}
		card.querySelector('h3').textContent = h.textContent;
		card.querySelector('[data-role="text"]').append(...parts);
		h.remove();
	});
}

export function create_community({ store }) {
	adopt_prize_texts();
	const tabs = [...document.querySelectorAll('#board-tabs [role="tab"]')];
	let last = null;

	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => store.set('board', { tab: tab.dataset.view }));
		tab.addEventListener('keydown', (e) => {
			const move = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
			if (move !== undefined) {
				e.preventDefault();
				const next = tabs[(i + move + tabs.length) % tabs.length];
				store.set('board', { tab: next.dataset.view });
				next.focus();
			}
		});
	});
	$('board-sort').addEventListener('change', (e) => store.set('board', { sort: e.target.value }));
	$('board-more').addEventListener('click', () => store.set('board', { expanded: !store.get().board.expanded }));
	$('board-csv').addEventListener('click', () => {
		if (last) {
			download(csv_name(last.view, last.period, last.version), to_csv(views[last.view].columns, last.rows));
		}
	});

	const two = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const pct = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
	function prize(id, p, describe) {
		const card = $(id);
		const winner = card.querySelector('[data-role="winner"]');
		const value = card.querySelector('[data-role="value"]');
		const among = `${p.eligible} fisher${p.eligible === 1 ? '' : 's'} with at least ${p.min_fish} fish`;
		if (!p.winners.length) {
			winner.textContent = 'No winner yet';
			value.textContent = p.eligible ? `No release recorded · ${among}` : `No fisher with at least ${p.min_fish} fish in this period`;
			return;
		}
		winner.textContent = p.winners.join(' & ');
		value.textContent = `${describe(p)}${p.winners.length > 1 ? ' · tied' : ''} · ${among}`;
	}

	return {
		update({ tables, contract, version, board, period, scope_text }) {
			const scope = community(tables, contract).all;
			const view = views[board.tab] ? board.tab : 'leaderboard';
			const sort = board.sort;
			prize('prize-biodiversity', scope.prizes.biodiversity, (p) => `Simpson index ${two.format(p.value)}`);
			prize('prize-conservation', scope.prizes.conservation, (p) => `${pct.format(p.value)}% released (${p.released} of ${p.fish})`);
			tabs.forEach((t) => {
				const on = t.dataset.view === view;
				t.setAttribute('aria-selected', String(on));
				t.tabIndex = on ? 0 : -1;
			});
			$('board-panel').setAttribute('aria-labelledby', `tab-${view}`);
			$('board-sort-wrap').hidden = view !== 'leaderboard';
			$('board-sort').value = sort;
			const rows = view_rows(scope, view, sort);
			const limit = view === 'leaderboard' && !board.expanded ? 10 : rows.length;
			const shown = rows.slice(0, limit);
			const cols = views[view].columns;
			$('board-caption').textContent = `${views[view].tab} · ${scope_text}`;
			$('board-table').querySelector('thead').replaceChildren(el('tr', {}, cols.map((c) => el('th', { scope: 'col', class: c.num ? 'num' : null }, c.label))));
			$('board-table').querySelector('tbody').replaceChildren(...shown.map((r) => el('tr', {}, cols.map((c) => {
				if (c.key === 'rank') {
					return el('td', { class: 'rank' }, r.medal ? [el('span', { 'aria-hidden': 'true' }, `${r.medal.icon} `), el('span', { class: 'visually-hidden' }, r.medal.text)] : String(r.rank), r.medal ? el('span', { 'aria-hidden': 'true' }, String(r.rank)) : null);
				}
				const v = r[c.key];
				return el(c.key === 'fisher' ? 'th' : 'td', { scope: c.key === 'fisher' ? 'row' : null, class: c.num ? 'num' : null }, v === null || v === undefined ? '–' : c.num && typeof v === 'number' ? number.format(v) : String(v));
			}))));
			const notes = [scope_text];
			if (view === 'leaderboard') {
				notes.push(`ranked: fishers with at least ${scope.prizes.biodiversity.min_fish} fish`);
			}
			if (view !== 'leaderboard' && (view === 'longest' ? scope.longest : scope.heaviest).truncated_ties) {
				notes.push('more fish share the 10th place');
			}
			if (scope.provisional) {
				notes.push('includes trips in progress');
			}
			$('board-note').textContent = notes.join(' · ');
			const more = $('board-more');
			more.hidden = view !== 'leaderboard' || rows.length <= 10;
			more.textContent = board.expanded ? 'Show top 10' : `Show all ${rows.length} fishers`;
			more.setAttribute('aria-expanded', String(Boolean(board.expanded)));
			$('board-empty').hidden = rows.length > 0;
			$('board-empty').textContent = 'No fish recorded in this period.';
			$('board-table').hidden = rows.length === 0;
			$('board-csv').disabled = rows.length === 0;
			last = { view, period, version, rows };
		}
	};
}
