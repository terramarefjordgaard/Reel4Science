// Observations section, catch over time (spec 2.3 PLOT-01 rev, DEC-26): the chosen species over the shared period,
// a line with a point on every sampled day; hollow points for days with trips in progress; local fisher, gear and
// station filters; day detail on click; table alternative.
import { el, fill_select } from './dom.mjs';
import { catch_timeseries, catch_options, day_detail } from './catch_data.mjs';
import { plotly, base_layout, grid, config, phone } from './plotly.mjs';

const $ = (id) => document.getElementById(id);

export function create_catch({ store }) {
	['fisher', 'gear', 'station'].forEach((k) => $(`catch-${k}`).addEventListener('change', (e) => store.set('obs', { [k]: e.target.value || null })));
	$('catch-reset').addEventListener('click', () => store.reset('obs', ['fisher', 'gear', 'station']));
	let ctx = null;
	let generation = 0;

	function show_day(date) {
		const rows = day_detail(ctx.tables, ctx.contract, ctx.filter, date, ctx.filter.species);
		const box = $('catch-day');
		box.hidden = false;
		box.replaceChildren(
			el('div', { class: 'day-head' }, el('h4', {}, `${ctx.filter.species} · ${date}`), el('button', { type: 'button', class: 'link-button', onclick: () => {
				box.hidden = true;
			} }, 'Close')),
			rows.length
				? el('div', { class: 'table-wrap' }, el('table', { class: 'cards' },
					el('thead', {}, el('tr', {}, ['Fisher', 'Length (cm)', 'Weight (g)', 'Gear', 'Station', 'Status'].map((h) => el('th', { scope: 'col' }, h)))),
					// data-label: the column name, shown before the value when the table becomes cards on phones
					el('tbody', {}, rows.map((r) => el('tr', {}, el('td', {}, r.fisher), el('td', { class: 'num is-key', 'data-label': 'Length (cm)' }, r.length_cm ?? '-'), el('td', { class: 'num', 'data-label': 'Weight (g)' }, r.weight_g ?? '-'), el('td', { 'data-label': 'Gear' }, r.gear ?? '-'), el('td', { 'data-label': 'Station' }, r.station), el('td', { 'data-label': 'Status' }, r.provisional ? 'Provisional' : ''))))))
				: el('p', { class: 'detail-hint' }, 'Fishing day without this species.'));
	}

	return {
		async update({ tables, contract, species, obs, colour, scope_text }) {
			const mine = (generation += 1);
			const opts = catch_options(tables, contract);
			const filter = {
				species,
				fisher: fill_select($('catch-fisher'), 'All fishers', opts.fishers, obs.fisher),
				gear: fill_select($('catch-gear'), 'All gears', opts.gears, obs.gear),
				station: fill_select($('catch-station'), 'All stations', opts.stations, obs.station)
			};
			ctx = { tables, contract, filter };
			const s = catch_timeseries(tables, contract, filter);
			$('catch-title').textContent = `Catch over time · ${species}`;
			$('catch-note').textContent = `${s.total} fish on ${s.days.length} fishing days · ${scope_text}`;
			$('catch-empty').hidden = s.days.length > 0;
			$('catch-empty').textContent = 'No fishing days in this period.';
			$('catch-day').hidden = true;
			$('catch-table').querySelector('tbody').replaceChildren(...s.days.map((d) => el('tr', {},
				el('td', {}, d.date), el('td', { class: 'num is-key', 'data-label': 'Fish' }, String(d.count)), el('td', { 'data-label': 'Fishers' }, d.fishers.join(', ') || '-'), el('td', { 'data-label': 'Stations' }, d.stations.join(', ') || '-'), el('td', { 'data-label': 'Status' }, d.provisional ? 'Trip in progress' : ''))));
			const Plotly = await plotly();
			if (mine !== generation) {
				return;
			}
			const trace = {
				type: 'scatter',
				mode: 'lines+markers',
				x: s.days.map((d) => d.date),
				y: s.days.map((d) => d.count),
				line: { color: colour, width: 1.5 },
				marker: { size: 7, color: s.days.map((d) => (d.provisional ? '#ffffff' : colour)), line: { color: colour, width: 2 } },
				customdata: s.days.map((d) => [d.fishers.join(', ') || '-', d.gears.join(', ') || '-', d.stations.join(', ') || '-', d.provisional ? 'Trip in progress' : '']),
				hovertemplate: `%{x|%d %b %Y} · ${species}<br>%{y} fish<br>Fishers: %{customdata[0]}<br>Gear: %{customdata[1]}<br>Stations: %{customdata[2]}<br>%{customdata[3]}<extra></extra>`
			};
			const top = Math.max(0, ...s.days.map((d) => d.count));
			const layout = {
				...base_layout,
				height: phone() ? 300 : 380,
				margin: { l: 44, r: 12, t: 8, b: 40 },
				showlegend: false,
				xaxis: { ...grid, type: 'date', tickformat: '%b %Y', nticks: 6, tickangle: 0 },
				yaxis: { ...grid, rangemode: 'tozero', tickformat: 'd', dtick: top <= 6 ? 1 : null, title: { text: 'Fish' } }
			};
			const gd = $('catch-chart');
			await Plotly.react(gd, [trace], layout, config);
			if (!gd.dataset.bound) {
				gd.on('plotly_click', (e) => show_day(String(e.points[0].x).slice(0, 10)));
				gd.dataset.bound = '1';
			}
		}
	};
}
