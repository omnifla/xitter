// themeApi, import/export HTTP handlers, load/save look, nightModeCookies, DB access.

import type { Viewer } from "../auth";
import { prepareFonts } from "../fonts";
import { accentWire, type Accent, type Theme } from "./presets";
import {
	NIGHT_MODE_ATTR,
	THEME_FILE_MAX,
	applyWrite,
	copyTheme,
	exportTheme,
	importTheme,
	lookView,
	mergeSavedBackground,
	modeOf,
	overlayAccent,
	parseLookWrite,
	readPrefs,
	themeFileName,
	type Look,
	type LookWrite,
	type Prefs,
} from "./validate";

export async function themeImport(req: Request, _viewer: Viewer): Promise<Response> {
	if (req.method !== "POST") return Response.json({ ok: false, errors: [{ path: "", message: "use POST" }] }, { status: 405 });
	const announced = Number(req.headers.get("content-length"));
	if (Number.isFinite(announced) && announced > THEME_FILE_MAX) return Response.json({ ok: false, errors: [{ path: "", message: "file is too large" }] }, { status: 400 });
	const result = importTheme(await req.text());
	if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 400 });
	return Response.json({ ok: true, theme: result.theme, warnings: result.warnings });
}

export async function themeExport(req: Request, viewer: Viewer): Promise<Response> {
	if (req.method !== "GET") return Response.json({ ok: false, errors: [{ path: "", message: "use GET" }] }, { status: 405 });
	const prefs = await loadPrefs(viewer.id);
	const theme = prefs.look?.kind === "painted" ? prefs.look.theme : null;
	if (!theme) return Response.json({ ok: false, errors: [{ path: "theme", message: "no saved theme" }] }, { status: 404 });
	const file = exportTheme(theme);
	return new Response(JSON.stringify(file), {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="${themeFileName(theme)}"`,
		},
	});
}

export function nightModeCookies(look: Look | null): readonly string[] {
	if (!look) return [];
	return [`night_mode=${modeOf(look) === "light" ? "0" : "2"}; ${NIGHT_MODE_ATTR}`];
}

async function keepOwnedBackground(userId: string, theme: Theme, warnings: string[]): Promise<Theme> {
	const id = theme.background?.mediaId;
	if (!id) return theme;
	const { ownedThemePhoto } = await import("../media");
	const owned = await ownedThemePhoto(userId, id);
	if (owned) return theme;
	warnings.push("that background image isn't on this account");
	const next = copyTheme(theme);
	next.background = { fit: theme.background!.fit, position: theme.background!.position, dim: theme.background!.dim, blur: theme.background!.blur };
	return next;
}

export async function commitLook(
	userId: string,
	current: Prefs,
	write: LookWrite,
	accent: Accent | undefined,
	warnings: readonly string[] = [],
): Promise<{ look: Look | null; accent: Accent; warnings: readonly string[] }> {
	const nextWarnings = [...warnings];
	let next = write;
	if (write.type === "paint") {
		const stored = current.look?.kind === "painted" ? current.look.theme : undefined;
		let theme = mergeSavedBackground(stored, write.theme, write.peel, write.mediaIdSent);
		theme = await keepOwnedBackground(userId, theme, nextWarnings);
		if (theme.font) {
			const prep = await prepareFonts(theme.font);
			nextWarnings.push(...prep.warnings);
			if (prep.font.ui || prep.font.display) theme = { ...theme, font: prep.font };
			else {
				theme = { ...theme };
				delete theme.font;
			}
		}
		next = { type: "paint", theme, peel: write.peel, mediaIdSent: write.mediaIdSent };
	}
	const nextAccent = accent ?? current.accent;
	const look = overlayAccent(applyWrite(current.look, next), nextAccent);
	await saveLook(userId, look, nextAccent);
	return { look, accent: nextAccent, warnings: nextWarnings };
}

async function saveLook(userId: string, look: Look | null, accent: Accent): Promise<void> {
	const { sql } = await import("../db");
	const patch =
		look?.kind === "native"
			? { mode: look.mode, accent: accentWire(accent) }
			: look?.kind === "painted"
				? { theme: look.theme, accent: accentWire(accent) }
				: { accent: accentWire(accent) };
	await sql`update users set preferences = (coalesce(preferences, '{}') - 'theme' - 'mode' - 'accent') || ${JSON.stringify(patch)}::text::jsonb where id = ${userId}::bigint`;
}

export async function loadPrefs(userId: string): Promise<Prefs> {
	const { sql } = await import("../db");
	const [row] = await sql`select preferences from users where id = ${userId}::bigint`;
	return readPrefs(row?.preferences);
}

export async function loadLook(userId: string): Promise<Look | null> {
	return (await loadPrefs(userId)).look;
}

export async function themeApi(req: Request, viewer: Viewer): Promise<Response> {
	if (req.method === "GET") {
		const prefs = await loadPrefs(viewer.id);
		return Response.json(lookView(prefs.look, prefs.accent));
	}
	if (req.method !== "POST") return Response.json({ error: "use GET or POST" }, { status: 405 });
	const body = await req.json().catch(() => null);
	const current = await loadPrefs(viewer.id);
	const parsed = parseLookWrite(body);
	if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
	const saved = await commitLook(viewer.id, current, parsed.write, parsed.accent, parsed.warnings);
	const headers = new Headers();
	for (const c of nightModeCookies(saved.look)) headers.append("set-cookie", c);
	const view = lookView(saved.look, saved.accent);
	if (parsed.write.type === "paint" || saved.warnings.length) return Response.json({ ...view, warnings: saved.warnings }, { headers });
	return Response.json(view, { headers });
}
