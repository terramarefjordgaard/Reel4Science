// Summaries over published tables (spec 2.3 SUM-01, MAP-02, TRIP-04), shared by the publisher and the browser.
// Pure: no DOM, Node or Google APIs; period on the event Date, species only on fish.

import { hour } from './time.mjs';

// Interpretation of source codes declared in the contract (CandR V-09, unknown fishers, NO_FISH)
export function rules(contract) {
	const a = contract.analytics;
	const upper = (list) => new Set(list.map((v) => String(v).trim().toUpperCase()));
	const yes = upper(a.released_values);
	const no = upper(a.not_released_values);
	const unknown = new Set(a.fishers.unknown_values.map((v) => String(v).trim().toLowerCase()));
	return {
		is_fish: (c) => c.Species !== a.no_fish_species,
		released: (v) => {
			if (v === null || v === undefined || v === '') {
				return null;
			}
			const k = String(v).trim().toUpperCase();
			return yes.has(k) ? true : no.has(k) ? false : null;
		},
		fisher: (name) => (name === null || name === undefined || unknown.has(String(name).trim().toLowerCase()) ? null : name)
	};
}

export function measure(v) {
	return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

// Duration in hours of a closed trip with End >= Start (one boat time, not per fisher); null when not computable
export function trip_hours(ev) {
	if (ev.trip_state !== 'closed' || !ev.start_at || !ev.end_at) {
		return null;
	}
	const h = (Date.parse(ev.end_at) - Date.parse(ev.start_at)) / hour;
	return h >= 0 ? h : null;
}

// Fisher-hours of a closed event with valid duration and Num_fisher; null when not computable
export function effort_hours(ev) {
	const h = trip_hours(ev);
	const n = measure(ev.Num_fisher);
	return h !== null && n !== null ? h * n : null;
}

const sum_or_null = (values) => (values.length ? values.reduce((a, b) => a + b, 0) : null);

// Distinct trip-fisher pairs over catch rows, NO_FISH included: a fisher who caught nothing still fished,
// people on board who never fished are not counted; rows without a known fisher count once per trip
function fishing_events(rows, r) {
	return new Set(rows.map((c) => JSON.stringify([c.VisitID, r.fisher(c.Fisherman)]))).size;
}

const fishing_days = (events) => new Set(events.map((e) => e.Date).filter((d) => d !== null)).size;

const release_rate = (fish, r) => (fish.length ? (fish.filter((c) => r.released(c.CandR) === true).length / fish.length) * 100 : null);

// rows: every catch row of the events (NO_FISH included, never filtered by species), for the fishing events
function totals(events, fish, r, rows) {
	const hours = events.map(effort_hours);
	const known = hours.filter((h) => h !== null);
	const durations = events.map(trip_hours);
	const known_durations = durations.filter((h) => h !== null);
	return {
		catches: fish.length,
		species: new Set(fish.map((c) => c.Species).filter((s) => s !== null && s !== '')).size,
		releases: fish.filter((c) => r.released(c.CandR) === true).length,
		events: events.length,
		open_trips: events.filter((e) => e.trip_state === 'open').length,
		fisher_hours: known.length ? known.reduce((s, h) => s + h, 0) : null,
		events_without_effort: hours.length - known.length,
		fishing_hours: sum_or_null(known_durations),
		trips_without_hours: durations.length - known_durations.length,
		fishing_events: fishing_events(rows, r),
		fishing_days: fishing_days(events),
		released_pct: release_rate(fish, r)
	};
}

// Simpson diversity 1 - D, D = sum of squared species shares (DEC-31): the chance that two fish taken at random
// are of different species; null without fish (never shown as 0)
export function simpson_diversity(counts) {
	const values = Object.values(counts).filter((n) => n > 0);
	const total = values.reduce((a, b) => a + b, 0);
	if (!total) {
		return null;
	}
	return 1 - values.reduce((d, n) => d + (n / total) ** 2, 0);
}

function composition(fish) {
	const counts = {};
	fish.filter((c) => c.Species !== null && c.Species !== '').forEach((c) => {
		counts[c.Species] = (counts[c.Species] || 0) + 1;
	});
	return Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
}

// filter: { from, to } as ISO dates (inclusive) on the event Date, species on fish only
export function summarize(tables, contract, filter = {}) {
	const r = rules(contract);
	const in_period = (d) => d !== null && (!filter.from || d >= filter.from) && (!filter.to || d <= filter.to);
	const events = tables.station_info.filter((e) => in_period(e.Date));
	const keys = new Set(events.map((e) => e.VisitID));
	const rows = tables.catchdata.filter((c) => keys.has(c.VisitID));
	const fish = rows.filter((c) => r.is_fish(c) && (!filter.species || c.Species === filter.species));
	const stations = [...new Set(events.map((e) => e.StationID))].sort().map((station) => {
		const ev = events.filter((e) => e.StationID === station);
		const ks = new Set(ev.map((e) => e.VisitID));
		const f = fish.filter((c) => ks.has(c.VisitID));
		const comp = composition(f);
		return { station, ...totals(ev, f, r, rows.filter((c) => ks.has(c.VisitID))), composition: comp, diversity: simpson_diversity(comp) };
	});
	return { ...totals(events, fish, r, rows), stations };
}

// Events dated within the period (ISO dates, inclusive) and only their catches; the registry is kept whole
export function filter_period(tables, { from = null, to = null } = {}) {
	if (!from && !to) {
		return tables;
	}
	const station_info = tables.station_info.filter((e) => e.Date !== null && (!from || e.Date >= from) && (!to || e.Date <= to));
	const keys = new Set(station_info.map((e) => e.VisitID));
	return { ...tables, station_info, catchdata: tables.catchdata.filter((c) => keys.has(c.VisitID)) };
}

// Project figures for the opening of the page, never filtered:
//   fishing_hours     sum of trip_hours (closed trips with End >= Start, one boat time, not per fisher)
//   fishing_events    distinct trip-fisher pairs over every catch row (see fishing_events above)
//   fishing_days      distinct dates with at least one trip
//   stations          distinct stations with at least one trip; stations_pct their share of the registry
//   hours_per_fisher  fisher-hours (duration x Num_fisher) divided by the number of named fishers
//   fish_per_hour     fish of trips with computable effort divided by their fisher-hours
export function project_stats(tables, contract) {
	const r = rules(contract);
	const fish = tables.catchdata.filter((c) => r.is_fish(c));
	const effort = new Map(tables.station_info.map((e) => [e.VisitID, effort_hours(e)]));
	const hours = [...effort.values()].filter((h) => h !== null);
	const fisher_hours = sum_or_null(hours);
	const fishers = new Set(fish.map((c) => r.fisher(c.Fisherman)).filter((f) => f !== null)).size;
	const fish_with_effort = fish.filter((c) => effort.get(c.VisitID) !== null && effort.get(c.VisitID) !== undefined).length;
	const visited = new Set(tables.station_info.map((e) => e.StationID).filter((s) => s !== null && s !== ''));
	const registry = new Set(tables.station_registry.map((s) => s.StationID).filter((s) => s !== null && s !== ''));
	return {
		fish: fish.length,
		fishing_hours: sum_or_null(tables.station_info.map(trip_hours).filter((h) => h !== null)),
		fishing_events: fishing_events(tables.catchdata, r),
		fishing_days: fishing_days(tables.station_info),
		stations: visited.size,
		stations_pct: registry.size ? ([...visited].filter((s) => registry.has(s)).length / registry.size) * 100 : null,
		released_pct: release_rate(fish, r),
		fisher_hours,
		fishers,
		hours_per_fisher: fisher_hours !== null && fishers ? fisher_hours / fishers : null,
		fish_per_hour: fisher_hours ? fish_with_effort / fisher_hours : null,
		species: new Set(fish.map((c) => c.Species).filter((s) => s !== null && s !== '')).size,
		diversity: simpson_diversity(composition(fish)),
		trips: tables.station_info.length
	};
}
