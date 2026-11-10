// Public state of the data (spec 2.3 BRW-04), from the age of the last source check and the read errors.
const minute = 6e4;

export function public_state({ has_copy, read_error, source_checked_at, delayed_after_minutes, now }) {
	if (!has_copy) {
		return 'unavailable';
	}
	const age = now - Date.parse(source_checked_at);
	return !read_error && age <= delayed_after_minutes * minute ? 'up_to_date' : 'delayed';
}

export const state_labels = { up_to_date: 'Up to date', delayed: 'Update delayed', unavailable: 'Data unavailable' };
