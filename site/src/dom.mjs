// Small DOM helpers shared by the views: elements built with textContent only, never innerHTML.
export function el(tag, attrs = {}, ...children) {
	const e = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (v === null || v === undefined || v === false) {
			return;
		}
		if (k === 'class') {
			e.className = v;
		} else if (k.startsWith('on')) {
			e.addEventListener(k.slice(2), v);
		} else {
			e.setAttribute(k, v === true ? '' : v);
		}
	});
	children.flat(Infinity).forEach((c) => {
		if (c !== null && c !== undefined && c !== false) {
			e.append(c);
		}
	});
	return e;
}

export const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export function fill_select(select, first_label, values, chosen) {
	select.replaceChildren(new Option(first_label, ''), ...values.map((v) => new Option(v, v)));
	select.value = values.includes(chosen) ? chosen : '';
	return select.value || null;
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
	const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
	const a = el('a', { href: url, download: name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
