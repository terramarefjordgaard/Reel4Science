// Banner and toasts (spec 2.3 DEC-17, DEC-21, UX-06): the banner lists every open trip;
// a toast only for notifications that arrive while the page is open.
const titles = { trip_started: 'Fishing trip started', trip_ended: 'Fishing trip ended' };

// Instants are published in the source zone with an explicit offset: the wall time is the local time
const wall_time = (iso) => iso.slice(11, 16);
const wall_date = (iso) => iso.slice(0, 10);

export function create_notifier() {
	let seen = null;
	return {
		update(status) {
			const fresh = status.notifications.filter((n) => titles[n.type]);
			if (seen === null) {
				seen = new Set(fresh.map((n) => n.id));
				return [];
			}
			const added = fresh.filter((n) => !seen.has(n.id));
			added.forEach((n) => seen.add(n.id));
			return added.map((n) => `${titles[n.type]} · ${n.station} · ${wall_time(n.at)}`);
		}
	};
}

export function banner_items(open_trips) {
	return open_trips.map((t) => `${t.station} · started ${wall_date(t.start)} ${wall_time(t.start)}`);
}
