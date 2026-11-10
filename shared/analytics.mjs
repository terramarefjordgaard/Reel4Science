// Results of the publisher, also recomputed in the browser for the chosen period: prizes (DEC-30) and
// leaderboards (LB-01..03) for all species and for each species, top fish, and the length-weight fit with its
// confidence band (PLOT-04).
import { rules, measure, summarize, simpson_diversity } from './metrics.mjs';
import { t_quantile } from './tdist.mjs';

// Alphabetical order by character code, the same on every computer
function code_order(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

// Competition ranking: rows sorted by compare, then by tie; rows equal under compare share the rank and the
// next rank skips (1, 2, 2, 4)
function ranked(rows, compare, tie) {
	const sorted = [...rows].sort((a, b) => compare(a, b) || tie(a, b));
	let rank = 0;
	return sorted.map((row, i) => {
		if (i === 0 || compare(sorted[i - 1], row) !== 0) {
			rank = i + 1;
		}
		return { rank, ...row };
	});
}

// Equal up to rounding errors of the computer
const same = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

// Ranking for a prize (DEC-30, DEC-32): fishers with at least min_fish fish, not excluded, are ranked; the others
// follow, by name, with rank null
function prize_order(rows, compare, by_name) {
	const unranked = rows.filter((r) => !r.eligible).sort(by_name).map((r) => ({ rank: null, ...r }));
	return [...ranked(rows.filter((r) => r.eligible), compare, by_name), ...unranked];
}

const by_diversity = (a, b) => (same(a.diversity, b.diversity) ? 0 : b.diversity - a.diversity);
const by_conservation = (a, b) => (same(a.released_pct, b.released_pct) ? b.releases - a.releases : b.released_pct - a.released_pct);

// Prize winners: rank 1 of the prize order, when its value is above zero
function prize(order, key, min_fish) {
	const top = order.filter((r) => r.rank === 1 && r[key] > 0);
	const eligible = order.filter((r) => r.eligible).length;
	const value = top.length ? top[0][key] : null;
	return { value, winners: top.map((r) => r.fisher), eligible, min_fish };
}

// Prizes, leaderboards and top fish of one group of fish (all species, or one species)
function scope(fish, ctx) {
	const { r, open, top_n } = ctx;
	const by_fisher = new Map();
	fish.forEach((c) => {
		const name = r.fisher(c.Fisherman);
		if (name === null) {
			return;
		}
		const f = by_fisher.get(name) || { fisher: name, catches: 0, species: new Set(), counts: {}, releases: 0 };
		f.catches += 1;
		if (c.Species !== null && c.Species !== '') {
			f.species.add(c.Species);
			f.counts[c.Species] = (f.counts[c.Species] || 0) + 1;
		}
		f.releases += r.released(c.CandR) === true ? 1 : 0;
		by_fisher.set(name, f);
	});
	const rows = [...by_fisher.values()].map((f) => {
		const diversity = simpson_diversity(f.counts);
		return {
			fisher: f.fisher,
			catches: f.catches,
			species: f.species.size,
			releases: f.releases,
			released_pct: (f.releases / f.catches) * 100,
			diversity,
			eligible: f.catches >= ctx.min_fish && diversity !== null && !ctx.excluded.has(f.fisher.trim().toLowerCase())
		};
	});
	const by_name = (a, b) => code_order(a.fisher, b.fisher);
	const leaderboard = Object.fromEntries(['catches', 'species', 'releases'].map((m) => [m, ranked(rows, (a, b) => b[m] - a[m], by_name)]));
	leaderboard.biodiversity = prize_order(rows, by_diversity, by_name);
	leaderboard.conservation = prize_order(rows, by_conservation, by_name);
	const conservation = prize(leaderboard.conservation, 'released_pct', ctx.min_fish);
	const winner = leaderboard.conservation.find((r) => r.rank === 1 && conservation.winners.includes(r.fisher));
	const top = (field) => {
		const valid = fish.filter((c) => measure(c[field]) !== null);
		const order = ranked(valid, (a, b) => b[field] - a[field], (a, b) => code_order(a.Date, b.Date) || code_order(a.CatchID, b.CatchID));
		const rows_out = order.slice(0, top_n).map((c) => {
			const weight = measure(c.Weight);
			return {
				rank: c.rank,
				catch_id: c.CatchID,
				fisher: r.fisher(c.Fisherman),
				species: c.Species,
				length_cm: measure(c.Length),
				weight_g: weight,
				weight_kg: weight === null ? null : weight / 1000,
				gear: c.FishingGear ?? null,
				station: c.StationID,
				date: c.Date,
				nptf: c.NPTF ?? null,
				released: r.released(c.CandR),
				provisional: open.has(c.VisitID)
			};
		});
		const cut = order.length > top_n && order[top_n][field] === order[top_n - 1][field];
		return { rows: rows_out, truncated_ties: cut };
	};
	return {
		provisional: fish.some((c) => open.has(c.VisitID)),
		prizes: {
			biodiversity: prize(leaderboard.biodiversity, 'diversity', ctx.min_fish),
			conservation: { ...conservation, released: winner ? winner.releases : null, fish: winner ? winner.catches : null }
		},
		leaderboard,
		longest: top('Length'),
		heaviest: top('Weight')
	};
}

// Fish only (no NO_FISH rows) and the list of their species
function fish_by_species(tables, r) {
	const fish = tables.catchdata.filter(r.is_fish);
	const species = [...new Set(fish.map((c) => c.Species).filter((s) => s !== null && s !== ''))].sort(code_order);
	return { fish, species };
}

// Community results: everything together, then each species on its own
export function community(tables, contract) {
	const r = rules(contract);
	const prizes = contract.analytics.prizes || {};
	const ctx = {
		r,
		open: new Set(tables.station_info.filter((e) => e.trip_state === 'open').map((e) => e.VisitID)),
		top_n: contract.analytics.top_n,
		// contracts published before DEC-30 have no prizes section: same default as the current contract
		min_fish: prizes.min_fish ?? 5,
		// accounts that never win a prize (for example the organisation's own), compared trimmed and without case
		excluded: new Set((prizes.excluded_fishers || []).map((x) => x.trim().toLowerCase()))
	};
	const { fish, species } = fish_by_species(tables, r);
	return { all: scope(fish, ctx), species: Object.fromEntries(species.map((s) => [s, scope(fish.filter((c) => c.Species === s), ctx)])) };
}

// ln(W) = ln(a) + b ln(L) by least squares; pointwise confidence band of the mean on the log scale,
// Student t with n - 2 degrees of freedom, back-transformed with exp without bias correction,
// on grid_points lengths evenly spaced over the observed range. pairs: [[length_cm, weight_g], ...], all positive.
export function lw_fit(pairs, opts) {
	const n = pairs.length;
	if (n < Math.max(3, opts.min_pairs)) {
		return { n, fit: null, reason: 'too_few_pairs' };
	}
	const lengths = pairs.map((p) => p[0]);
	const min = Math.min(...lengths);
	const max = Math.max(...lengths);
	const x = lengths.map(Math.log);
	const y = pairs.map((p) => Math.log(p[1]));
	const mean = (v) => v.reduce((s, a) => s + a, 0) / v.length;
	const xbar = mean(x);
	const ybar = mean(y);
	const sxx = x.reduce((s, xi) => s + (xi - xbar) ** 2, 0);
	if (min === max || !(sxx > 0)) {
		return { n, fit: null, reason: 'no_length_variance' };
	}
	const b = x.reduce((s, xi, i) => s + (xi - xbar) * (y[i] - ybar), 0) / sxx;
	const log_a = ybar - b * xbar;
	const df = n - 2;
	const sigma = Math.sqrt(y.reduce((s, yi, i) => s + (yi - log_a - b * x[i]) ** 2, 0) / df);
	const t = t_quantile(1 - (1 - opts.confidence_level) / 2, df);
	const k = opts.grid_points;
	const grid = { length: [], fit: [], lwr: [], upr: [] };
	for (let i = 0; i < k; i += 1) {
		const len = i === k - 1 ? max : min + (i * (max - min)) / (k - 1);
		const x0 = Math.log(len);
		const yhat = log_a + b * x0;
		const half = t * sigma * Math.sqrt(1 / n + (x0 - xbar) ** 2 / sxx);
		grid.length.push(len);
		grid.fit.push(Math.exp(yhat));
		grid.lwr.push(Math.exp(yhat - half));
		grid.upr.push(Math.exp(yhat + half));
	}
	return { n, fit: { a: Math.exp(log_a), log_a, b, sigma, df, t, level: opts.confidence_level, domain: [min, max], grid }, reason: null };
}

// Length-weight fit of each species, with the fish that have both length and weight
export function lw_results(tables, contract) {
	const r = rules(contract);
	const { fish, species } = fish_by_species(tables, r);
	return Object.fromEntries(species.map((s) => {
		const pairs = fish
			.filter((c) => c.Species === s)
			.map((c) => [measure(c.Length), measure(c.Weight)])
			.filter(([l, w]) => l !== null && w !== null);
		return [s, lw_fit(pairs, contract.analytics.lw)];
	}));
}

// Everything published under "results" in latest.json
export function compute_results(tables, contract) {
	const { stations, ...overview } = summarize(tables, contract);
	const r = rules(contract);
	return {
		overview: { ...overview, no_fish: tables.catchdata.filter((c) => !r.is_fish(c)).length },
		community: community(tables, contract),
		lw: lw_results(tables, contract)
	};
}
