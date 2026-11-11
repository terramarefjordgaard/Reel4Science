// Plotly (basic bundle: bar and scatter) loaded on first use, with the site font and colours.
let loading = null;

// Every screen (DEC-44, DEC-45): no zoom by dragging and no tool bar, so one finger always scrolls the page on
// phones; a click or a tap on a point still shows its value. Phones get lower charts.
export const phone = () => window.matchMedia('(max-width: 600px)').matches;

export function plotly() {
	loading = loading || import('plotly.js-basic-dist-min').then((m) => m.default || m);
	return loading;
}

export const base_layout = {
	font: { family: "'Libre Baskerville', Georgia, serif", size: 12, color: '#1f4a50' },
	paper_bgcolor: '#ffffff',
	plot_bgcolor: '#ffffff',
	hoverlabel: { font: { family: "'Libre Baskerville', Georgia, serif" } },
	dragmode: false
};

export const grid = { gridcolor: '#e6ece8', linecolor: '#c9d5cf', zeroline: false };

export const config = { displaylogo: false, responsive: true, displayModeBar: false };
