// Section 4 length-weight points (spec 2.3 PLOT-02): the same sample the publisher fitted
// (valid positive length and weight, all dates); highlighting never changes it.
import { rules, measure } from '../../shared/metrics.mjs';

export function lw_points(tables, contract, species) {
	const r = rules(contract);
	return tables.catchdata
		.filter((c) => r.is_fish(c) && c.Species === species && measure(c.Length) !== null && measure(c.Weight) !== null)
		.map((c) => ({ catch_id: c.CatchID, fisher: r.fisher(c.Fisherman), date: c.Date, gear: c.FishingGear ?? null, station: c.StationID, length: c.Length, weight: c.Weight }));
}

export function default_lw_species(lw) {
	const entries = Object.entries(lw).sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
	return entries.length ? entries[0][0] : null;
}

// Colour of a highlighted fisher from their position among all fishers of the species: stable while selecting
export function fisher_colours(highlight, all_fishers, palette) {
	return Object.fromEntries(highlight.map((f) => [f, palette[Math.max(0, all_fishers.indexOf(f)) % palette.length]]));
}

// Literature reference W = a * L^b (DEC-33) on `points` lengths over the observed range, clipped to the reference
// length_range when the contract gives one; null when there is no reference or no overlap
export function reference_curve(ref, observed, points = 100) {
	if (!ref || !observed) {
		return null;
	}
	const lo = ref.length_range ? Math.max(observed[0], ref.length_range[0]) : observed[0];
	const hi = ref.length_range ? Math.min(observed[1], ref.length_range[1]) : observed[1];
	if (!(lo < hi)) {
		return null;
	}
	const length = Array.from({ length: points }, (_, i) => (i === points - 1 ? hi : lo + (i * (hi - lo)) / (points - 1)));
	return { length, weight: length.map((l) => ref.a * l ** ref.b) };
}
