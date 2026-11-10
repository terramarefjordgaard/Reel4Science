// Polling of status.json (spec 2.3 BRW-02): one check at a time, next one after the previous ends,
// only while the page is visible; after failures the wait doubles up to retry_max.
export function create_poller({ run, interval_ms, retry_max_ms, set_timer, clear_timer }) {
	let timer = null;
	let running = null;
	let visible = true;
	let fail_wait = 0;

	const clear = () => {
		if (timer) {
			clear_timer(timer);
			timer = null;
		}
	};

	async function tick() {
		timer = null;
		if (!visible || running) {
			return running;
		}
		running = (async () => {
			try {
				await run();
				fail_wait = 0;
			} catch {
				fail_wait = Math.min(fail_wait ? fail_wait * 2 : interval_ms * 2, retry_max_ms);
			}
		})();
		await running;
		running = null;
		if (visible) {
			clear();
			timer = set_timer(tick, fail_wait || interval_ms);
		}
		return undefined;
	}

	return {
		start: () => tick(),
		// Also used when the connection comes back: check at once unless a check is running
		set_visible(v) {
			visible = v;
			if (!v) {
				clear();
				return running;
			}
			if (running) {
				return running;
			}
			clear();
			return tick();
		}
	};
}
