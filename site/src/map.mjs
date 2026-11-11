// Section 1 map (spec 2.3 MAP-01..03): Leaflet with sampled stations only, open trips with their own marker and
// legend text, marker size chosen by the visitor, station detail, station list. Without basemap the rest works.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { map_stations, composition_parts } from './map_data.mjs';

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const size_labels = { catches: 'fish recorded', events: 'fishing trips', species: 'species' };

function el(tag, attrs = {}, ...children) {
	const e = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') {
			e.className = v;
		} else if (k.startsWith('on')) {
			e.addEventListener(k.slice(2), v);
		} else {
			e.setAttribute(k, v);
		}
	});
	children.flat().forEach((c) => e.append(c));
	return e;
}

// Touch screens (DEC-44): one finger scrolls the page, two fingers move and zoom the map; a one-finger swipe on the
// map shows a short hint
const touch = window.matchMedia('(pointer: coarse)').matches;

export function create_map({ cfg, root, on_select }) {
	const map = L.map(root.querySelector('#map'), { scrollWheelZoom: false, dragging: !touch, zoomSnap: 0.5, minZoom: cfg.map.min_zoom || 3, worldCopyJump: true }).setView(cfg.map.center, cfg.map.zoom);
	if (touch) {
		const hint = root.querySelector('#map-hint');
		let timer = null;
		root.querySelector('#map').addEventListener('touchmove', (e) => {
			if (e.touches.length === 1) {
				hint.hidden = false;
				clearTimeout(timer);
				timer = setTimeout(() => (hint.hidden = true), 1500);
			}
		}, { passive: true });
	}
	const notice = root.querySelector('#map-notice');
	let tiles_ok = false;
	// World background in grey under Kartverket, so that zooming out never shows an empty map outside Norway
	if (cfg.map.background) {
		L.tileLayer(cfg.map.background.tiles, { attribution: cfg.map.background.attribution, maxZoom: cfg.map.max_zoom, className: 'basemap-bg' }).addTo(map);
	}
	L.tileLayer(cfg.map.tiles, { attribution: cfg.map.attribution, maxZoom: cfg.map.max_zoom })
		.on('tileload', () => {
			tiles_ok = true;
			notice.hidden = true;
		})
		.on('tileerror', () => {
			if (!tiles_ok) {
				notice.textContent = 'Basemap unavailable. Stations, the station list and the summaries remain available.';
				notice.hidden = false;
			}
		})
		.addTo(map);
	const layer = L.layerGroup().addTo(map);
	let fitted = false;
	let last = null;

	const fit = () => {
		if (last && last.placed.length) {
			map.fitBounds(L.latLngBounds(last.placed.map((s) => [s.lat, s.lon])).pad(0.1), { maxZoom: 13 });
		} else {
			map.setView(cfg.map.center, cfg.map.zoom);
		}
	};
	root.querySelector('#map-reset').addEventListener('click', fit);

	// On phones the detail of a newly chosen station opens over the map (class is-open) until closed
	let detail_of = null;
	const close_detail = () => root.querySelector('#station-detail').classList.remove('is-open');

	function render_detail(view, selected, scope_text, species_order) {
		const box = root.querySelector('#station-detail');
		const s = [...view.placed, ...view.unplaced].find((x) => x.station === selected);
		if (selected !== detail_of) {
			box.classList.toggle('is-open', Boolean(selected));
			detail_of = selected;
		}
		const close = el('button', { type: 'button', class: 'detail-close', id: 'detail-close', 'aria-label': 'Close station detail', onclick: close_detail }, '✕');
		if (!selected) {
			box.replaceChildren(el('p', { class: 'detail-hint' }, 'Select a station on the map or in the station list.'));
			return;
		}
		if (!s) {
			box.replaceChildren(close, el('p', { class: 'eyebrow' }, 'Selected station'), el('h3', {}, selected), el('p', { class: 'detail-hint' }, `No fishing trips here: ${scope_text}.`));
			return;
		}
		const two = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const pct = { format: (v) => `${Math.round(v)}%` };
		const fig = (value, label, fmt = number) => el('div', { class: 'fig' }, el('span', { class: 'fig-n' }, value === null ? 'n/a' : fmt.format(value)), el('span', { class: 'fig-l' }, label));
		const parts = composition_parts(s.composition, species_order, cfg.palette.species);
		box.replaceChildren(...[
			close,
			el('p', { class: 'eyebrow' }, 'Selected station'),
			el('h3', {}, s.station),
			el('p', { class: 'detail-sub' }, [s.area, s.lat === undefined ? 'Position not available' : null].filter(Boolean).join(' · ') || ' '),
			s.open ? el('p', { class: 'detail-open' }, 'Trip in progress: figures are provisional.') : '',
			el('div', { class: 'figs' }, fig(s.catches, 'fish recorded'), fig(s.species, 'species'), fig(s.events, 'fishing trips'), fig(s.fishing_events, 'fishing events'), fig(s.fishing_days, 'fishing days'), fig(s.fishing_hours, 'fishing hours'), fig(s.released_pct, 'release rate', pct), fig(s.diversity, 'biodiversity (1 − D)', two)),
			s.trips_without_hours ? el('p', { class: 'detail-note' }, `${s.trips_without_hours} trip(s) without fishing hours.`) : '',
			el('p', { class: 'eyebrow' }, 'Catch composition'),
			parts.length
				? [el('div', { class: 'bar', role: 'img', 'aria-label': parts.map((p) => `${p.species} ${p.count}`).join(', ') }, parts.map((p) => el('span', { style: `width:${p.share}%;background:${p.colour}` }))),
					el('ul', { class: 'bar-legend' }, parts.map((p) => el('li', {}, el('span', { class: 'swatch', style: `background:${p.colour}` }), `${p.species} ${p.count}`)))]
				: el('p', { class: 'detail-hint' }, 'No fish recorded for this selection.'),
			el('p', { class: 'detail-note' }, scope_text)
		].flat());
	}

	function render_list(view, selected) {
		const rows = [...view.placed, ...view.unplaced].sort((a, b) => (a.station < b.station ? -1 : 1));
		root.querySelector('#station-count').textContent = String(rows.length);
		root.querySelector('#station-rows').replaceChildren(...rows.map((s) => el('tr', { class: s.station === selected ? 'is-selected' : '' },
			// data-label: the column name, shown before the value when the table becomes cards on phones
			el('th', { scope: 'row' }, el('button', { type: 'button', class: 'link-button', onclick: () => on_select(s.station) }, s.station)),
			el('td', { 'data-label': 'Area' }, s.area || '-'),
			el('td', { class: 'num is-key', 'data-label': 'Fish' }, number.format(s.catches)),
			el('td', { class: 'num', 'data-label': 'Species' }, number.format(s.species)),
			el('td', { class: 'num', 'data-label': 'Fishing events' }, number.format(s.fishing_events)),
			el('td', { class: 'num', 'data-label': 'Fishing hours' }, s.fishing_hours === null ? 'n/a' : number.format(s.fishing_hours)),
			el('td', { 'data-label': 'Status' }, [s.open ? 'Trip in progress' : '', s.lat === undefined ? 'Position not available' : ''].filter(Boolean).join(' · ') || 'Sampled'))));
	}

	return {
		update({ stations, registry, size, selected, scope_text, species_order }) {
			last = map_stations(stations, registry, size);
			// markers are redrawn: keep the keyboard focus on the same station
			const focused = document.activeElement && document.activeElement.classList.contains('station-marker') ? document.activeElement.title : null;
			layer.clearLayers();
			last.placed.forEach((s) => {
				const d = Math.round(s.radius * 2);
				const icon = L.divIcon({ className: `station-marker${s.open ? ' is-open' : ''}${s.station === selected ? ' is-selected' : ''}`, html: '<span></span>', iconSize: [d, d] });
				L.marker([s.lat, s.lon], { icon, keyboard: true, title: s.station, alt: s.station, riseOnHover: true })
					.bindTooltip(`${s.station}${s.open ? ' · trip in progress' : ''} · ${number.format(s.value)} ${size_labels[size]}`, { direction: 'top', offset: [0, -d / 2] })
					.on('click', () => on_select(s.station))
					.on('add', (e) => {
						// Enter or Space on the focused marker selects the station, like a button
						e.target.getElement().addEventListener('keydown', (k) => {
							if (k.key === 'Enter' || k.key === ' ') {
								k.preventDefault();
								on_select(s.station);
							}
						});
					})
					.addTo(layer);
			});
			if (focused) {
				const again = root.querySelector(`#map .station-marker[title="${CSS.escape(focused)}"]`);
				if (again) {
					again.focus();
				}
			}
			root.querySelector('#map-count').textContent = `${last.placed.length} station${last.placed.length === 1 ? '' : 's'} on the map${last.unplaced.length ? `, ${last.unplaced.length} without position (see the list)` : ''}`;
			root.querySelector('#legend-size').textContent = `Marker size: ${size_labels[size]}`;
			if (!fitted && last.placed.length) {
				fit();
				fitted = true;
			}
			render_detail(last, selected, scope_text, species_order);
			render_list(last, selected);
		},
		leaflet: map
	};
}
