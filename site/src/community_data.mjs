// Section 2 table views (spec 2.3 LB-01..04): rows from the precomputed results of the chosen species scope.
const medals = ['🥇', '🥈', '🥉'];
const ordinals = ['1st', '2nd', '3rd'];

export function medal(rank) {
	return rank >= 1 && rank <= 3 ? { icon: medals[rank - 1], text: ordinals[rank - 1] } : null;
}

const fish_columns = (measure) => [
	{ key: 'rank', label: 'Rank' },
	{ key: 'fisher', label: 'Fisher' },
	{ key: 'species', label: 'Species' },
	{ key: 'value', label: measure, num: true },
	{ key: 'station', label: 'Station' },
	{ key: 'date', label: 'Date' },
	{ key: 'gear', label: 'Gear' },
	{ key: 'status', label: 'Status' }
];

export const views = {
	leaderboard: {
		tab: 'Leaderboard',
		columns: [
			{ key: 'rank', label: 'Rank' },
			{ key: 'fisher', label: 'Fisher' },
			{ key: 'catches', label: 'Fish recorded', num: true },
			{ key: 'species', label: 'Species', num: true },
			{ key: 'released', label: 'Release rate (%)', num: true },
			{ key: 'diversity', label: 'Biodiversity (1 − D)', num: true }
		]
	},
	longest: { tab: 'Longest fish', columns: fish_columns('Length (cm)') },
	heaviest: { tab: 'Heaviest fish', columns: fish_columns('Weight (kg)') }
};

// Leaderboard orders (DEC-32): the two prizes
export const sorts = { biodiversity: 'Biodiversity prize', conservation: 'Conservation prize' };
const pct = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

function status(row) {
	return [row.released === true ? 'Released' : '', row.provisional ? (row.released === true ? 'provisional' : 'Provisional') : ''].filter(Boolean).join(' · ');
}

export function view_rows(scope, view, sort = 'biodiversity') {
	if (view === 'leaderboard') {
		return scope.leaderboard[sorts[sort] ? sort : 'biodiversity'].map((r) => ({
			rank: r.rank === null ? '–' : r.rank,
			medal: r.rank === null ? null : medal(r.rank),
			fisher: r.fisher,
			catches: r.catches,
			species: r.species,
			released: pct.format(r.released_pct),
			diversity: r.diversity === null ? null : r.diversity.toFixed(2)
		}));
	}
	const source = view === 'longest' ? scope.longest : scope.heaviest;
	return source.rows.map((r) => ({
		rank: r.rank,
		medal: medal(r.rank),
		fisher: r.fisher === null ? 'Unknown fisher' : r.fisher,
		species: r.species,
		value: view === 'longest' ? String(r.length_cm) : r.weight_kg.toFixed(2),
		station: r.station,
		date: r.date,
		gear: r.gear,
		status: status(r)
	}));
}
