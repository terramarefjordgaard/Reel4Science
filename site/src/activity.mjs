// "Latest trip" line (DEC-44): shown under the opening while no trip is in progress, so the top of the page always
// says something recent. Station, when the trip ended and how many fish; never the names of the fishers.
import { rules } from '../../shared/metrics.mjs';

// The closed trip that ended last: { station, end_at, fish }, or null when there is none
export function latest_trip(tables, contract) {
	const closed = tables.station_info.filter((e) => e.trip_state === 'closed' && e.end_at);
	if (!closed.length) {
		return null;
	}
	const last = closed.reduce((a, b) => (Date.parse(b.end_at) > Date.parse(a.end_at) ? b : a));
	const is_fish = rules(contract).is_fish;
	const fish = tables.catchdata.filter((c) => c.VisitID === last.VisitID && is_fish(c)).length;
	return { station: last.StationID, end_at: last.end_at, fish };
}

// e.g. "Latest trip: Brattlia · ended 2 h ago · 3 fish"; after a week the date instead of the time passed
export function activity_text(trip, now, timezone) {
	const minutes = Math.floor((now - Date.parse(trip.end_at)) / 6e4);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	let when;
	if (minutes < 1) {
		when = 'just now';
	} else if (minutes < 60) {
		when = `${minutes} min ago`;
	} else if (hours < 24) {
		when = `${hours} h ago`;
	} else if (days < 7) {
		when = `${days} day${days === 1 ? '' : 's'} ago`;
	} else {
		when = `on ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: timezone }).format(new Date(trip.end_at))}`;
	}
	const fish = trip.fish ? `${trip.fish} fish` : 'no fish';
	return `Latest trip: ${trip.station} · ended ${when} · ${fish}`;
}
