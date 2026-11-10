// Observations section, length-weight (spec 2.3 PLOT-02, PLOT-04, DEC-13, DEC-25/26): the chosen species over the
// shared period; one scatter trace with every point in a fixed order (grey, semi-transparent), highlighted fishers
// coloured with a dark border, chosen from a drop-down; fit W = a·L^b with its confidence band, computed with the
// publisher's shared code (R-verified) on the period sample; literature reference from the contract as a grey line
// (DEC-33); log axes; PNG. Highlighting never changes sample, fit or reference.
import { el, number } from './dom.mjs';
import { lw_points, fisher_colours, reference_curve } from './lw_data.mjs';
import { lw_fit } from '../../shared/analytics.mjs';
import { plotly, base_layout, grid, config } from './plotly.mjs';

const $ = (id) => document.getElementById(id);
const neutral = 'rgba(85, 107, 108, 0.45)';
const reasons = { too_few_pairs: 'Fewer than 3 fish measured: no curve.', no_length_variance: 'All fish have the same length: no curve.' };

export function create_lw({ store, cfg }) {
	$('lw-log').addEventListener('change', (e) => store.set('obs', { log_axes: e.target.checked }));
	let gd = null;
	$('lw-png').addEventListener('click', async () => {
		if (gd) {
			(await plotly()).downloadImage(gd, { format: 'png', filename: `reel4science_length-weight_${(current_species || 'species').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, width: 1200, height: 800 });
		}
	});
	let generation = 0;
	let current_species = null;

	return {
		async update({ tables, contract, species, obs, scope_text }) {
			const mine = (generation += 1);
			current_species = species;
			$('lw-log').checked = obs.log_axes;
			const pts = lw_points(tables, contract, species);
			const r = lw_fit(pts.map((p) => [p.length, p.weight]), contract.analytics.lw);
			const fishers = [...new Set(pts.map((p) => p.fisher).filter(Boolean))].sort();
			const highlight = obs.highlight.filter((f) => fishers.includes(f));
			const colours = fisher_colours(highlight, fishers, cfg.palette.species);
			const count = (f) => pts.filter((p) => p.fisher === f).length;
			$('lw-fishers').replaceChildren(...(fishers.length ? fishers.map((f) => el('label', { class: 'check' },
				el('input', { type: 'checkbox', value: f, checked: highlight.includes(f), onchange: (e) => store.set('obs', { highlight: e.target.checked ? [...highlight, f] : highlight.filter((x) => x !== f) }) }),
				colours[f] ? el('span', { class: 'swatch', style: `background:${colours[f]};border:1px solid #003941` }) : null,
				`${f} (${count(f)})`)) : [el('p', { class: 'detail-hint' }, 'No measured fish in this period.')]));
			$('lw-highlight-label').textContent = highlight.length === 1 ? highlight[0] : highlight.length ? `${highlight.length} fishers` : 'Fishers';
			$('lw-title').textContent = `Length and weight · ${species}`;
			$('lw-sub').textContent = `${r.n} fish measured · ${scope_text}`;
			const fit = r.fit;
			$('lw-fit').replaceChildren(...(fit
				? [el('p', { class: 'eyebrow' }, 'Length-weight relationship'),
					el('p', { class: 'formula', 'aria-label': `W equals ${fit.a.toPrecision(3)} times L to the power ${fit.b.toFixed(2)}` }, `W = ${fit.a.toPrecision(3)} × L`, el('sup', {}, fit.b.toFixed(2))),
					el('p', { class: 'detail-note' }, `W in g, L in cm · ${r.n} fish from ${number.format(fit.domain[0])} to ${number.format(fit.domain[1])} cm · shaded: ${Math.round(fit.level * 100)}% confidence band of the curve`)]
				: [el('p', { class: 'detail-note' }, reasons[r.reason] || 'No fitted curve.')]));
			const lengths = pts.map((p) => p.length);
			const ref = (contract.analytics.lw.references || {})[species];
			const ref_curve = reference_curve(ref, lengths.length ? [Math.min(...lengths), Math.max(...lengths)] : null, contract.analytics.lw.grid_points);
			if (ref_curve) {
				$('lw-fit').append(el('p', { class: 'detail-note ref-line' },
					`Reference: W = ${ref.a} × L`, el('sup', {}, String(ref.b)), ' · ',
					ref.url ? el('a', { href: ref.url, target: '_blank', rel: 'noopener' }, ref.citation) : ref.citation));
			}
			const hl = (p) => p.fisher && colours[p.fisher];
			const traces = [];
			if (ref_curve) {
				traces.push({ type: 'scatter', mode: 'lines', x: ref_curve.length, y: ref_curve.weight, line: { color: '#8a9a9b', width: 2 }, hovertemplate: `Reference: %{y:.0f} g at %{x:.1f} cm<extra></extra>`, showlegend: false, meta: 'reference' });
			}
			if (fit) {
				traces.push(
					{ type: 'scatter', mode: 'lines', x: fit.grid.length, y: fit.grid.lwr, line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
					{ type: 'scatter', mode: 'lines', x: fit.grid.length, y: fit.grid.upr, fill: 'tonexty', fillcolor: 'rgba(189, 89, 47, 0.14)', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
					{ type: 'scatter', mode: 'lines', x: fit.grid.length, y: fit.grid.fit, line: { color: '#b3261e', width: 2, dash: 'dash' }, hovertemplate: 'Fit: %{y:.0f} g at %{x:.1f} cm<extra></extra>', showlegend: false }
				);
			}
			traces.push({
				type: 'scatter',
				mode: 'markers',
				x: pts.map((p) => p.length),
				y: pts.map((p) => p.weight),
				customdata: pts.map((p) => [p.fisher || 'Unknown fisher', p.date, p.gear || '-', p.station]),
				marker: {
					size: pts.map((p) => (hl(p) ? 10 : 8)),
					color: pts.map((p) => hl(p) || neutral),
					line: { color: pts.map((p) => (hl(p) ? '#002a30' : 'rgba(255,255,255,0.8)')), width: pts.map((p) => (hl(p) ? 1.5 : 0.5)) }
				},
				hovertemplate: `%{customdata[0]} · ${species}<br>%{customdata[1]} · %{customdata[2]} · %{customdata[3]}<br>Length %{x} cm · Weight %{y} g<extra></extra>`,
				showlegend: false
			});
			$('lw-legend').replaceChildren(
				el('li', {}, el('span', { class: 'swatch', style: `background:${neutral}` }), `All observations (${pts.length})`),
				fit ? el('li', {}, el('span', { class: 'line-key' }), 'Fit to observations') : null,
				fit ? el('li', {}, el('span', { class: 'band-key' }), `${Math.round(fit.level * 100)}% confidence band`) : null,
				ref_curve ? el('li', {}, el('span', { class: 'ref-key' }), 'Literature reference') : null,
				...highlight.map((f) => el('li', {}, el('span', { class: 'swatch', style: `background:${colours[f]};border:1px solid #002a30` }), `${f} (${count(f)})`))
			);
			const type = obs.log_axes ? 'log' : 'linear';
			const layout = {
				...base_layout,
				height: 380,
				margin: { l: 64, r: 16, t: 8, b: 52 },
				xaxis: { ...grid, type, title: { text: 'Length (cm)' } },
				yaxis: { ...grid, type, title: { text: 'Weight (g)' } }
			};
			const Plotly = await plotly();
			if (mine !== generation) {
				return;
			}
			gd = $('lw-chart');
			await Plotly.react(gd, traces, layout, config);
		}
	};
}
