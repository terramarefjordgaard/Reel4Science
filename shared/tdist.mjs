// Student t quantile, as R qt(p, df), without external libraries (checked against R in tests/tdist.test.mjs).
// Upper tail S(t) = I_x(df/2, 1/2) / 2 with x = df / (df + t^2) (regularized incomplete beta);
// the quantile is found by Newton steps from t = 0: S is decreasing and convex for t > 0, so the steps
// approach the root from below and never overshoot.

const LN_SQRT_2PI = 0.9189385332046728;
const lanczos = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

// log Gamma for x >= 0.5 (Lanczos, g = 7)
function lgamma(x) {
	const z = x - 1;
	let a = lanczos[0];
	for (let i = 1; i < 9; i += 1) {
		a += lanczos[i] / (z + i);
	}
	const t = z + 7.5;
	return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// lgamma(x) - Stirling approximation, for x >= 10 (as R lgammacor)
function lgammacor(x) {
	const x2 = 1 / (x * x);
	return (1 / 12 - x2 * (1 / 360 - x2 * (1 / 1260 - x2 * (1 / 1680 - x2 * (1 / 1188 - x2 * (691 / 360360 - x2 / 156)))))) / x;
}

// log Beta(a, b), as R lbeta: no cancellation between large log Gamma values
function lbeta(a, b) {
	const p = Math.min(a, b);
	const q = Math.max(a, b);
	if (p >= 10) {
		const corr = lgammacor(p) + lgammacor(q) - lgammacor(p + q);
		return -0.5 * Math.log(q) + LN_SQRT_2PI + corr + (p - 0.5) * Math.log(p / (p + q)) + q * Math.log1p(-p / (p + q));
	}
	if (q >= 10) {
		const corr = lgammacor(q) - lgammacor(p + q);
		return lgamma(p) + corr + p - p * Math.log(p + q) + (q - 0.5) * Math.log1p(-p / (p + q));
	}
	return lgamma(p) + lgamma(q) - lgamma(p + q);
}

// Continued fraction of the incomplete beta (modified Lentz)
function beta_cf(x, a, b) {
	const tiny = 1e-300;
	let c = 1;
	let d = 1 - ((a + b) * x) / (a + 1);
	d = 1 / (Math.abs(d) < tiny ? tiny : d);
	let h = d;
	for (let m = 1; m <= 10000; m += 1) {
		const m2 = 2 * m;
		for (const num of [(m * (b - m) * x) / ((a + m2 - 1) * (a + m2)), (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))]) {
			d = 1 + num * d;
			d = 1 / (Math.abs(d) < tiny ? tiny : d);
			c = 1 + num / c;
			c = Math.abs(c) < tiny ? tiny : c;
			h *= d * c;
		}
		if (Math.abs(d * c - 1) < 1e-16) {
			break;
		}
	}
	return h;
}

// Upper tail of the t distribution for t >= 0; x and y = 1 - x computed separately to keep their precision
function upper_tail(t, df) {
	const a = df / 2;
	const b = 0.5;
	const x = df / (df + t * t);
	const y = (t * t) / (df + t * t);
	if (y === 0) {
		return 0.5;
	}
	const front = Math.exp(a * -Math.log1p((t * t) / df) + b * Math.log(y) - lbeta(a, b));
	const ix = x < (a + 1) / (a + b + 2) ? (front * beta_cf(x, a, b)) / a : 1 - (front * beta_cf(y, b, a)) / b;
	return ix / 2;
}

function density(t, df) {
	return Math.exp(-lbeta(df / 2, 0.5) - 0.5 * Math.log(df) - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

export function t_quantile(p, df) {
	if (!(p > 0 && p < 1 && df > 0)) {
		return Number.NaN;
	}
	if (p === 0.5) {
		return 0;
	}
	const tail = p < 0.5 ? p : 1 - p;
	let t = 0;
	for (let i = 0; i < 1000; i += 1) {
		const step = (upper_tail(t, df) - tail) / density(t, df);
		if (!(step > 0)) {
			break;
		}
		t += step;
		if (step <= 1e-16 * t) {
			break;
		}
	}
	return p < 0.5 ? -t : t;
}
