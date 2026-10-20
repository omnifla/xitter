// Server-side CSS: deriveTokens, account/boot/page-chrome CSS, font links, background paint.

import { fontSlug } from "../fonts";
import { CHIRP, fillOfAccent, type Accent, type BgFit, type BgPosition, type BlurPx, type Dim, type Theme } from "./presets";
import { INK, WHITE, derived, fillCss, mixHex, readableOn, rgba, solidOf } from "./validate";

export type BackgroundPaint = {
	readonly image: string;
	readonly still: string | null;
	readonly fit: BgFit;
	readonly position: BgPosition;
	readonly dim: Dim;
	readonly blur: BlurPx;
};

export type AccountTokens = {
	bg: string;
	bar: string;
	text: string;
	muted: string;
	border: string;
	field: string;
	outline: string;
	surface: string;
	hover: string;
	logo: string;
	scheme: string;
	accent: string;
	accentHover: string;
	font?: string;
};

export function deriveTokens(theme: Theme): AccountTokens {
	const d = derived(theme);
	const accentHover = mixHex(d.accent, INK, 0.12);
	return {
		bg: d.bg,
		bar: d.header,
		text: d.text,
		muted: d.muted,
		border: d.border,
		field: d.inputBorder,
		outline: d.secondaryButtonBorder,
		surface: solidOf(theme.surface),
		hover: d.hover,
		logo: theme.base === "light" ? "url(/public/logo-light.png)" : "url(/public/logo-dark.png)",
		scheme: theme.base,
		accent: d.accent,
		accentHover,
		font: theme.font?.ui ? `"${theme.font.ui}",${CHIRP}` : undefined,
	};
}

export function xtVars(theme: Theme): Record<string, string> {
	const d = derived(theme);
	return {
		"--xt-bg": d.bg,
		"--xt-surface": d.surface,
		"--xt-text": d.text,
		"--xt-secondary": d.secondary,
		"--xt-muted": d.muted,
		"--xt-link": d.link,
		"--xt-border": d.border,
		"--xt-divider": d.divider,
		"--xt-accent": d.accent,
		"--xt-accent-fill": d.accentFill,
		"--xt-button": d.button,
		"--xt-button-text": d.buttonText,
		"--xt-button-hover": d.buttonHover,
		"--xt-header": d.header,
		"--xt-hover": d.hover,
		"--xt-input": d.inputBg,
		"--xt-input-text": d.inputText,
		"--xt-input-border": d.inputBorder,
		"--xt-menu": d.menu,
		"--xt-tooltip": d.tooltip,
		"--xt-icon": d.icon,
		"--xt-icon-active": d.iconActive,
		"--xt-reply": d.reply,
		"--xt-repost": d.repost,
		"--xt-like": d.like,
		"--xt-bookmark": d.bookmark,
		"--xt-views": d.views,
		"--xt-secondary-button": d.secondaryButton,
		"--xt-secondary-button-border": d.secondaryButtonBorder,
		"--xt-secondary-button-text": d.secondaryButtonText,
		"--xt-badge": d.badge,
		"--xt-selection": d.selection,
		"--xt-accent-soft": d.accentSoft,
		"--xt-reply-soft": d.replySoft,
		"--xt-repost-soft": d.repostSoft,
		"--xt-like-soft": d.likeSoft,
		"--xt-bookmark-soft": d.bookmarkSoft,
	};
}

export function accentVars(accent: Accent): string {
	const fill = fillOfAccent(accent);
	const solid = solidOf(fill);
	const hover = mixHex(solid, INK, 0.12);
	return `--xt-accent:${solid};--xt-accent-fill:${fillCss(fill)};--xt-accent-soft:${rgba(solid, 0.1)};--xt-accent-hover:${hover};--accent:${solid};--accent-fill:${fillCss(fill)};--accent-hover:${hover};--accent-text:${readableOn([solid])}`;
}

export function accountVars(theme: Theme): string {
	const tkn = deriveTokens(theme);
	const d = derived(theme);
	const rows: Record<string, string> = {
		bg: tkn.bg,
		bar: tkn.bar,
		text: tkn.text,
		muted: tkn.muted,
		border: tkn.border,
		field: tkn.field,
		outline: tkn.outline,
		surface: tkn.surface,
		hover: tkn.hover,
		logo: tkn.logo,
		accent: tkn.accent,
		"accent-fill": d.accentFill,
		"accent-hover": tkn.accentHover,
		"accent-text": /^#[0-9a-f]{6}$/i.test(tkn.accent) ? readableOn([tkn.accent]) : WHITE,
	};
	if (tkn.font) rows.font = tkn.font;
	return Object.entries(rows)
		.map(([k, v]) => `--${k}:${v}`)
		.join(";") + `;color-scheme:${tkn.scheme}`;
}

function fontFamilyCss(theme: Theme): string {
	let css = "";
	if (theme.font?.ui) css += `html[data-xitter-theme] body,html[data-xitter-theme] .css-146c3p1,html[data-xitter-theme] .css-1jxf684{font-family:"${theme.font.ui}",${CHIRP}!important}`;
	if (theme.font?.display)
		css += `html[data-xitter-theme] [data-testid="User-Name"] span:first-of-type,html[data-xitter-theme] [data-testid="UserName"],html[data-xitter-theme] h1,html[data-xitter-theme] h2{font-family:"${theme.font.display}",${CHIRP}!important}`;
	return css;
}

const PAGE_GATE = "html[data-xitter-theme]:not([data-xitter-decor])";
const FIT_CSS: Record<BgFit, string> = { cover: "cover", contain: "contain", tile: "auto" };
const POSITION_CSS: Record<BgPosition, string> = { center: "center", top: "top", bottom: "bottom" };

function cssUrl(path: string): string {
	if (!/^\/media\/(?:poster\/)?\d{1,19}\.(?:png|gif|webp|jpg)$/.test(path)) return "none";
	return `url("${path}")`;
}

export function pageChromeCss(paint?: BackgroundPaint): string {
	if (!paint) return "";
	const repeat = paint.fit === "tile" ? "repeat" : "no-repeat";
	const still = paint.still ? cssUrl(paint.still) : cssUrl(paint.image);
	return (
		`html[data-xitter-theme]{--xt-bg-image:${cssUrl(paint.image)};--xt-bg-still:${still};--xt-bg-size:${FIT_CSS[paint.fit]};--xt-bg-position:${POSITION_CSS[paint.position]};--xt-bg-repeat:${repeat};--xt-bg-dim:${paint.dim / 100};--xt-bg-blur:${paint.blur}px}` +
		`${PAGE_GATE} body{position:relative;z-index:0}` +
		`${PAGE_GATE} body::before{content:"";position:fixed;inset:0;z-index:-1;background-image:var(--xt-bg-image);background-size:var(--xt-bg-size);background-position:var(--xt-bg-position);background-repeat:var(--xt-bg-repeat);filter:blur(var(--xt-bg-blur));pointer-events:none}` +
		`${PAGE_GATE} body::after{content:"";position:fixed;inset:0;z-index:-1;background:rgb(0 0 0 / var(--xt-bg-dim));pointer-events:none}` +
		`@media (prefers-reduced-motion:reduce){${PAGE_GATE} body::before{animation:none;background-image:var(--xt-bg-still)}}`
	);
}

export function bootCss(theme: Theme, paint?: BackgroundPaint): string {
	const vars = Object.entries(xtVars(theme))
		.map(([k, v]) => `${k}:${v}`)
		.join(";");
	return (
		`html[data-xitter-theme]{${vars}}` +
		`html[data-xitter-theme] ::selection{background:var(--xt-selection)}` +
		`${PAGE_GATE},${PAGE_GATE} body{background:var(--xt-bg)!important;background-attachment:fixed!important}` +
		`${PAGE_GATE} #react-root>div>div,${PAGE_GATE} #react-root>div>div>div:not([data-testid]){background-color:transparent!important}` +
		pageChromeCss(paint) +
		fontFamilyCss(theme)
	);
}

export async function resolveBackground(userId: string, theme: Theme): Promise<BackgroundPaint | undefined> {
	const bg = theme.background;
	if (!bg?.mediaId) return;
	const { ownedThemePhoto, themeMediaPath, themePosterPath } = await import("../media");
	const photo = await ownedThemePhoto(userId, bg.mediaId);
	if (!photo) return;
	return {
		image: themeMediaPath(bg.mediaId, photo.ext),
		still: photo.poster ? themePosterPath(bg.mediaId) : null,
		fit: bg.fit,
		position: bg.position,
		dim: bg.dim,
		blur: bg.blur,
	};
}

export function bootAccentCss(accent: Accent): string {
	return `html{${accentVars(accent)}}`;
}

export function fontLinks(theme: Theme | null): string {
	if (!theme?.font) return "";
	const names = [theme.font.ui, theme.font.display].filter((n, i, a): n is string => !!n && a.indexOf(n) === i);
	return names.map((n) => `<link rel="stylesheet" href="/i/xitter/fonts/${fontSlug(n)}/fonts.css">`).join("");
}
