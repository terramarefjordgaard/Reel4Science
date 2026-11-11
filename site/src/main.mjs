// Browser wiring: fetch with timeout from the raw data repository; state, banner, toasts, controls and summaries.
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@fontsource/libre-baskerville/700.css';
import yaml from 'js-yaml';
import { create_app } from './app.mjs';
import { create_store } from './store.mjs';
import { summarize, project_stats, filter_period } from '../../shared/metrics.mjs';
import { species_by_count } from './catch_data.mjs';
import { without_fishers } from './community_data.mjs';
import { create_map } from './map.mjs';
import { create_community } from './community_view.mjs';
import { create_catch } from './catch_view.mjs';
import { create_lw } from './lw_view.mjs';
import { create_poller } from './poller.mjs';
import { state_labels } from './state.mjs';
import { latest_trip, activity_text } from './activity.mjs';

/* global __SITE__ */
const cfg = __SITE__;
const $ = (id) => document.getElementById(id);
const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: cfg.display_timezone });
const show_time = (iso) => (iso ? when.format(new Date(iso)) : '-');

async function load(which) {
	const url = `${cfg.data.base_url.replace(/\/+$/, '')}/${cfg.data[`${which}_path`]}`;
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), cfg.polling.request_timeout_seconds * 1000);
	try {
		const r = await fetch(url, { cache: 'no-cache', signal: ctl.signal });
		if (!r.ok) {
			throw new Error(`${which}: HTTP ${r.status}`);
		}
		return await r.json();
	} finally {
		clearTimeout(timer);
	}
}

const ui = {
	state(s) {
		const el = $('data-state');
		el.dataset.state = s.state;
		el.textContent = state_labels[s.state];
		$('last-update').textContent = s.data_published_at ? `Last successful update ${show_time(s.data_published_at)}` : '';
		$('source-checked').textContent = show_time(s.source_checked_at);
		$('data-published').textContent = show_time(s.data_published_at);
		$('imported').textContent = show_time(s.imported_at);
		$('period').textContent = s.period ? `${s.period[0]} to ${s.period[1]}` : '-';
		if (s.state === 'unavailable') {
			$('overview-empty').textContent = 'Data unavailable. The page will try again shortly.';
			['map-species', 'obs-species'].forEach((id) => {
				$(id).replaceChildren(new Option('Waiting for data', ''));
				$(id).disabled = true;
			});
		}
	},
	banner(items, info) {
		$('trips').hidden = items.length === 0;
		$('trips-heading').textContent = items.length === 1 ? 'Fishing trip in progress' : 'Fishing trips in progress';
		$('trips-stale').hidden = !info.stale;
		$('trips-stale').textContent = info.stale ? `Last known status, source checked ${show_time(info.source_checked_at)}` : '';
		$('trips-list').replaceChildren(...items.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
		open_trips = items.length;
		render_latest();
	},
	toast(text) {
		const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
		$('toasts').append(el);
		setTimeout(() => el.remove(), cfg.toast.seconds * 1000);
	},
	data(latest) {
		current = { latest, contract: yaml.load(latest.contract_yaml, { schema: yaml.CORE_SCHEMA }) };
		render_figures();
		render_latest();
		render('data');
	}
};

const store = create_store();
let current = null;
let map = null;
let open_trips = 0;
const community = create_community({ store });
const catches = create_catch({ store });
const lw = create_lw({ store, cfg });

// Project figures: everything published, never filtered (DEC-25)
function render_figures() {
	const o = project_stats(current.latest.tables, current.contract);
	const fmt = (v, digits = 0) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
	const known = (v) => v !== null && v !== undefined;
	$('overview').querySelectorAll('dd[data-key]').forEach((dd) => {
		const v = o[dd.dataset.key];
		dd.textContent = known(v) ? `${fmt(v, Number(dd.dataset.digits || 0))}${dd.dataset.unit || ''}` : 'n/a';
		// a share shown next to the count, smaller, e.g. stations "3 (60%)"
		const pct = dd.dataset.pct ? o[dd.dataset.pct] : null;
		if (known(v) && known(pct)) {
			dd.append(Object.assign(document.createElement('span'), { className: 'fig-pct', textContent: ` (${fmt(pct)}%)` }));
		}
	});
	$('overview').hidden = false;
	$('overview-empty').hidden = true;
	const m = current.latest.meta;
	['period-from', 'period-to'].forEach((id) => {
		$(id).min = m.period_start || '';
		$(id).max = today();
	});
	const p = store.get().period;
	if (!p.from && !p.to) {
		set_default_period();
	}
}

// Latest trip (DEC-44): only while no trip is in progress; the time passed is refreshed at every status check
function render_latest() {
	const trip = current && !open_trips ? latest_trip(current.latest.tables, current.contract) : null;
	$('latest').hidden = !trip;
	$('latest').textContent = trip ? activity_text(trip, Date.now(), cfg.display_timezone) : '';
}

// Default period (DEC-32): from the first date in the data to today, in the station time zone
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.display_timezone }).format(new Date());
function set_default_period() {
	const from = current ? current.latest.meta.period_start : null;
	$('period-from').value = from || '';
	$('period-to').value = today();
	store.set('period', { from, to: today() });
}

// Species menus: most caught first; a choice no longer in the data falls back to the first entry
function species_menu(select, list, chosen, first_label) {
	const values = list.map((x) => x.species);
	select.replaceChildren(...(first_label ? [new Option(first_label, '')] : []), ...list.map((x) => new Option(`${x.species} (${x.fish})`, x.species)));
	select.disabled = false;
	const value = values.includes(chosen) ? chosen : first_label ? '' : values[0] || '';
	select.value = value;
	return value || null;
}

function render(changed) {
	const d = store.describe();
	$('period-scope').textContent = d;
	$('period-short').textContent = d;
	if (!current) {
		return;
	}
	const st = store.get();
	const { latest, contract } = current;
	const tables = filter_period(latest.tables, st.period);
	const order = Object.keys(latest.results.community.species);
	const colour_of = (sp) => cfg.palette.species[Math.max(0, order.indexOf(sp)) % cfg.palette.species.length];
	const all_species = species_by_count(latest.tables, contract);
	if (['data', 'period', 'map'].includes(changed)) {
		const map_species = species_menu($('map-species'), all_species, st.map.species, 'All species');
		const o = summarize(latest.tables, contract, { from: st.period.from, to: st.period.to, species: map_species });
		map = map || create_map({ cfg, root: $('map-block'), on_select: (station) => store.set('map', { station }) });
		map.update({ stations: o.stations, registry: latest.tables.station_registry, size: st.map.size, selected: st.map.station, scope_text: `${d} · ${map_species || 'All species'}`, species_order: order });
	}
	if (['data', 'period', 'obs'].includes(changed)) {
		const species = species_menu($('obs-species'), all_species, st.obs.species, null);
		if (species) {
			catches.update({ tables, contract, species, obs: st.obs, colour: colour_of(species), scope_text: d });
			lw.update({ tables, contract, species, obs: st.obs, scope_text: d });
		}
	}
	// leaderboard and prizes over all dates, above the period row (DEC-44), without the excluded fishers (DEC-45)
	if (['data', 'board'].includes(changed)) {
		const ranked = without_fishers(latest.tables, cfg.leaderboard && cfg.leaderboard.excluded_fishers);
		community.update({ tables: ranked, contract, version: latest.meta.data_version, board: st.board, period: { from: null, to: null }, scope_text: 'All dates' });
	}
}

store.subscribe((scope) => render(scope));

// "i" buttons of the project figures: one explanation open at a time; Escape or a click elsewhere closes it
const infos = [...document.querySelectorAll('#overview .info')];
const close_infos = (except) => infos.filter((b) => b !== except).forEach((b) => {
	b.setAttribute('aria-expanded', 'false');
	$(b.getAttribute('aria-controls')).hidden = true;
});
infos.forEach((b) => b.addEventListener('click', (e) => {
	e.stopPropagation();
	const open = b.getAttribute('aria-expanded') !== 'true';
	close_infos(b);
	b.setAttribute('aria-expanded', String(open));
	$(b.getAttribute('aria-controls')).hidden = !open;
}));
document.addEventListener('click', () => close_infos(null));
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		close_infos(null);
	}
});
// Buttons that open and close a part of the page on phones (DEC-44): menu, rest of the opening, the other six
// figures, period dates. On a computer these buttons are not shown and every part is always open.
function opener(button_id, part, labels = null) {
	const button = $(button_id);
	const set = (open) => {
		button.setAttribute('aria-expanded', String(open));
		part.classList.toggle('is-open', open);
		if (labels) {
			button.textContent = open ? labels[1] : labels[0];
		}
	};
	button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
	return set;
}
const set_menu = opener('menu-toggle', document.querySelector('.top'));
document.querySelectorAll('#site-nav a').forEach((a) => a.addEventListener('click', () => set_menu(false)));
document.addEventListener('keydown', (e) => e.key === 'Escape' && set_menu(false));
opener('intro-more', $('intro'), ['Read more', 'Read less']);
opener('figures-more', $('figures'), ['More figures', 'Fewer figures']);
opener('period-toggle', $('period-bar'));

$('map-species').addEventListener('change', (e) => store.set('map', { species: e.target.value || null }));
$('map-size').addEventListener('change', (e) => store.set('map', { size: e.target.value }));
$('obs-species').addEventListener('change', (e) => store.set('obs', { species: e.target.value, highlight: [] }));
$('period-from').addEventListener('change', (e) => store.set('period', { from: e.target.value || null }));
$('period-to').addEventListener('change', (e) => store.set('period', { to: e.target.value || null }));
$('period-reset').addEventListener('click', set_default_period);
render();

const app = create_app({ load, config: cfg, now: () => Date.now(), ui });
const poller = create_poller({
	run: () => app.check(),
	interval_ms: cfg.polling.browser_interval_seconds * 1000,
	retry_max_ms: cfg.polling.retry_max_seconds * 1000,
	set_timer: (fn, ms) => setTimeout(fn, ms),
	clear_timer: (t) => clearTimeout(t)
});
document.addEventListener('visibilitychange', () => poller.set_visible(document.visibilityState === 'visible'));
window.addEventListener('online', () => document.visibilityState === 'visible' && poller.set_visible(true));
poller.start();
