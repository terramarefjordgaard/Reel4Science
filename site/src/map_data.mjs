// Map content (spec 2.3 MAP-01..03, DATA-13): sampled stations of the filtered summary, placed at the
// station_registry position; stations without valid coordinates are listed, never placed.
const sizes = ['catches', 'events', 'species'];
const min_radius = 8;
const max_radius = 26;

function position(row) {
	const lat = row && row.Lat;
	const lon = row && row.Lon;
	const ok = typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
	return ok ? { lat, lon } : null;
}

export function map_stations(summary_stations, registry, size_by) {
	if (!sizes.includes(size_by)) {
		throw new Error(`map: unknown marker size ${size_by}`);
	}
	const by_id = new Map(registry.map((r) => [r.StationID, r]));
	const rows = summary_stations.map((s) => {
		const reg = by_id.get(s.station);
		return { ...s, area: reg && reg.Area ? reg.Area : null, open: s.open_trips > 0, value: s[size_by], pos: position(reg) };
	});
	const top = Math.max(0, ...rows.map((r) => r.value));
	const radius = (v) => (top > 0 ? min_radius + (max_radius - min_radius) * Math.sqrt(v / top) : min_radius);
	const placed = rows.filter((r) => r.pos).map(({ pos, ...r }) => ({ ...r, ...pos, radius: radius(r.value) }));
	const unplaced = rows.filter((r) => !r.pos).map(({ pos, ...r }) => r);
	return { placed, unplaced };
}

// Species shares for the detail bar; colours follow the global species order so they stay stable
export function composition_parts(composition, species_order, palette) {
	const total = Object.values(composition).reduce((a, b) => a + b, 0);
	return Object.entries(composition).map(([species, count]) => ({
		species,
		count,
		share: (count / total) * 100,
		colour: palette[Math.max(0, species_order.indexOf(species)) % palette.length]
	}));
}
