// Observations section, catch over time (spec 2.3 PLOT-01 rev, DEC-26): one species at a time over the period,
// as a line with points on every sampled day; local fisher, gear and station filters.
import { rules } from '../../shared/metrics.mjs';

const uniq = (list) => [...new Set(list.filter((v) => v !== null && v !== undefined && v !== ''))].sort();

function fish_of(tables, contract) {
	const r = rules(contract);
	return { r, fish: tables.catchdata.filter((c) => r.is_fish(c) && c.Species) };
}

export function catch_options(tables, contract) {
	const { r, fish } = fish_of(tables, contract);
	return { fishers: uniq(fish.map((c) => r.fisher(c.Fisherman))), gears: uniq(fish.map((c) => c.FishingGear)), stations: uniq(fish.map((c) => c.StationID)) };
}

function selected(tables, contract, f) {
	const { r, fish } = fish_of(tables, contract);
	const open = new Set(tables.station_info.filter((e) => e.trip_state === 'open').map((e) => e.VisitID));
	const rows = fish.filter((c) => (!f.species || c.Species === f.species) && (!f.fisher || r.fisher(c.Fisherman) === f.fisher) && (!f.gear || c.FishingGear === f.gear) && (!f.station || c.StationID === f.station));
	return { r, open, rows };
}

// Fish of one species on every sampled day of the given tables (already limited to the period).
// A day counts as sampled when a trip took place (at the chosen station); zero is then a real observation.
export function catch_timeseries(tables, contract, f) {
	const { r, open, rows } = selected(tables, contract, f);
	const events = tables.station_info.filter((e) => e.Date && (!f.station || e.StationID === f.station));
	const days = uniq(events.map((e) => e.Date)).map((date) => {
		const day = rows.filter((c) => c.Date === date);
		return {
			date,
			count: day.length,
			fishers: uniq(day.map((c) => r.fisher(c.Fisherman) || 'Unknown fisher')),
			gears: uniq(day.map((c) => c.FishingGear)),
			stations: uniq(day.map((c) => c.StationID)),
			provisional: events.some((e) => e.Date === date && open.has(e.VisitID))
		};
	});
	return { days, total: rows.length };
}

export function species_by_count(tables, contract) {
	const { fish } = fish_of(tables, contract);
	const counts = {};
	fish.forEach((c) => {
		counts[c.Species] = (counts[c.Species] || 0) + 1;
	});
	return Object.entries(counts).map(([species, n]) => ({ species, fish: n })).sort((a, b) => b.fish - a.fish || (a.species < b.species ? -1 : 1));
}

export function day_detail(tables, contract, f, date, species) {
	const { r, open, rows } = selected(tables, contract, { ...f, species });
	return rows
		.filter((c) => c.Date === date)
		.sort((a, b) => (a.CatchID < b.CatchID ? -1 : 1))
		.map((c) => ({
			catch_id: c.CatchID,
			fisher: r.fisher(c.Fisherman) || 'Unknown fisher',
			length_cm: typeof c.Length === 'number' ? c.Length : null,
			weight_g: typeof c.Weight === 'number' ? c.Weight : null,
			gear: c.FishingGear ?? null,
			station: c.StationID,
			provisional: open.has(c.VisitID)
		}));
}
