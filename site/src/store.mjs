// Control state (spec 2.3 UX-02 rev, DEC-25): the period is the only filter shared by every section after the
// project figures; each section keeps its own controls. A reset never acts outside its scope.
//   period - shared row: map, observations, community
//   map    - species, marker size, selected station
//   obs    - observations: species, local fisher/gear/station filters, LW highlight and axes
//   board  - community: table tab, ranking, rows shown
const initial = () => ({
	period: { from: null, to: null },
	map: { species: null, size: 'catches', station: null },
	obs: { species: null, fisher: null, gear: null, station: null, highlight: [], log_axes: false },
	board: { tab: 'leaderboard', sort: 'biodiversity', expanded: false }
});

export function create_store() {
	let state = initial();
	const listeners = [];
	const notify = (scope) => listeners.forEach((fn) => fn(scope, structuredClone(state)));
	const check = (scope, fields) => {
		if (!(scope in state)) {
			throw new Error(`store: unknown scope ${scope}`);
		}
		fields.filter((k) => !(k in state[scope])).forEach((k) => {
			throw new Error(`store: unknown field ${scope}.${k}`);
		});
	};
	return {
		get: () => structuredClone(state),
		set(scope, patch) {
			check(scope, Object.keys(patch));
			state = { ...state, [scope]: { ...state[scope], ...structuredClone(patch) } };
			notify(scope);
		},
		// fields: reset only these fields of the scope (e.g. the local chart filters), default all
		reset(scope, fields = null) {
			check(scope, fields || []);
			const fresh = initial()[scope];
			const patch = fields ? Object.fromEntries(fields.map((k) => [k, fresh[k]])) : fresh;
			state = { ...state, [scope]: { ...state[scope], ...patch } };
			notify(scope);
		},
		subscribe(fn) {
			listeners.push(fn);
		},
		describe() {
			const { from, to } = state.period;
			return from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'All available dates';
		}
	};
}
