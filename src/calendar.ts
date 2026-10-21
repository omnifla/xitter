// The calls app's calendar: scheduled calls as events with occurrences.
//
// Times are Unix minutes, which the client sends and reads as strings. A
// recurring event is stored once and expanded on read; a change to one
// occurrence is an exception row, and "this and following" splits the series.
// Every event carries a call code: opening its meeting link makes the call
// (see ensureMeetingCall in chat.ts).

import type { Viewer } from "./auth";
import { PUBLIC_ORIGIN } from "./config";
import { ChatError, callCode, chatHandlers, userResults } from "./chat";
import { sql } from "./db";
import { isId, newId } from "./ids";

type Vars = Record<string, any>;
type Ev = {
	id: string;
	organizer_id: string;
	title: string | null;
	description: string | null;
	start_min: number;
	duration_min: number;
	tz: string;
	rrule: string | null;
	all_day: boolean;
	call_code: string;
	until_min: number | null;
	cancelled: boolean;
};
type Exception = { cancelled: boolean; title: string | null; description: string | null; start_min: number | null; duration_min: number | null };
type Scope = "THIS" | "ALL" | "THIS_AND_FOLLOWING";

const DAY = 1440;
const DAY_MS = 86_400_000;
const MAX_EVENTS = 500;
const MAX_INVITEES = 100;
const MAX_STEPS = 20_000;
const RSVPS = ["ACCEPTED", "DECLINED", "TENTATIVE"];
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const gid = (type: string, id: string) => Buffer.from(`${type}:${id}`).toString("base64");
const meetingUrl = (code: string) => `${PUBLIC_ORIGIN}/i/calls/${code}`;
const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const minutes = (v: unknown): number | undefined => ((typeof v === "string" || typeof v === "number") && /^-?\d{1,12}$/.test(String(v)) ? Number(v) : undefined);
const scopeOf = (v: unknown): Scope => (v === "ALL" || v === "THIS_AND_FOLLOWING" ? v : "THIS");

// --- time zones

const formats = new Map<string, Intl.DateTimeFormat>();

function zoneOf(tz: unknown): string {
	if (typeof tz !== "string" || !tz || tz.length > 64) return "UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: tz });
		return tz;
	} catch {
		return "UTC";
	}
}

function civil(min: number, tz: string) {
	let format = formats.get(tz);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
		formats.set(tz, format);
	}
	const p: Record<string, number> = {};
	for (const part of format.formatToParts(new Date(min * 60_000))) if (part.type !== "literal") p[part.type] = Number(part.value);
	return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute };
}

const asUtc = (c: ReturnType<typeof civil>) => Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi) / 60_000;

function fromCivil(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
	const guess = Date.UTC(y, m - 1, d, h, mi) / 60_000;
	const first = guess - (asUtc(civil(guess, tz)) - guess);
	return guess - (asUtc(civil(first, tz)) - first);
}

// --- repeat rules (RRULE: FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH)

type Rule = {
	freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
	interval: number;
	count?: number;
	until?: number;
	byDay: { n?: number; wd: number }[];
	byMonthDay: number[];
	byMonth: number[];
};

const numbers = (text: string | undefined, min: number, max: number) =>
	(text ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n !== 0 && Math.abs(n) >= min && Math.abs(n) <= max);

export function parseRule(text: string | null | undefined): Rule | undefined {
	if (!text) return undefined;
	const parts = new Map<string, string>();
	for (const piece of text.toUpperCase().split(";")) {
		const at = piece.indexOf("=");
		if (at > 0) parts.set(piece.slice(0, at).trim(), piece.slice(at + 1).trim());
	}
	const freq = parts.get("FREQ");
	if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return undefined;
	const until = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(parts.get("UNTIL") ?? "");
	const byDay = (parts.get("BYDAY") ?? "")
		.split(",")
		.map((s) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim()))
		.filter((m): m is RegExpExecArray => !!m)
		.map((m) => ({ n: m[1] ? Number(m[1]) : undefined, wd: WEEKDAYS.indexOf(m[2]) }));
	return {
		freq,
		interval: Math.max(1, Math.min(1000, Number(parts.get("INTERVAL")) || 1)),
		count: parts.has("COUNT") ? Math.max(1, Math.min(10_000, Number(parts.get("COUNT")) || 1)) : undefined,
		until: until ? Date.UTC(+until[1], +until[2] - 1, +until[3], until[4] ? +until[4] : 23, until[5] ? +until[5] : 59) / 60_000 : undefined,
		byDay,
		byMonthDay: numbers(parts.get("BYMONTHDAY"), 1, 31),
		byMonth: numbers(parts.get("BYMONTH"), 1, 12).filter((n) => n > 0),
	};
}

function monthDays(y: number, mo: number, rule: Rule, startDay: number): number[] {
	const length = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
	let days: number[];
	if (rule.byDay.length) {
		const first = new Date(Date.UTC(y, mo, 1)).getUTCDay();
		days = rule.byDay.flatMap(({ n, wd }) => {
			const all: number[] = [];
			for (let d = 1 + ((wd - first + 7) % 7); d <= length; d += 7) all.push(d);
			if (n == null) return all;
			const pick = n > 0 ? all[n - 1] : all[all.length + n];
			return pick == null ? [] : [pick];
		});
	} else days = (rule.byMonthDay.length ? rule.byMonthDay : [startDay]).map((d) => (d < 0 ? length + d + 1 : d));
	return [...new Set(days)].filter((d) => d >= 1 && d <= length).sort((a, b) => a - b);
}

function* starts(ev: Pick<Ev, "start_min" | "tz">, rule?: Rule): Generator<number> {
	if (!rule) {
		yield ev.start_min;
		return;
	}
	const s = civil(ev.start_min, ev.tz);
	const at = (ms: number) => {
		const d = new Date(ms);
		return fromCivil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), s.h, s.mi, ev.tz);
	};
	const base = Date.UTC(s.y, s.m - 1, s.d);
	if (rule.freq === "DAILY") for (let k = 0; ; k++) yield at(base + k * rule.interval * DAY_MS);
	else if (rule.freq === "WEEKLY") {
		const wds = [...new Set(rule.byDay.length ? rule.byDay.map((d) => d.wd) : [new Date(base).getUTCDay()])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
		const week = base - ((new Date(base).getUTCDay() + 6) % 7) * DAY_MS;
		for (let w = 0; ; w++)
			for (const wd of wds) {
				const day = week + (w * rule.interval * 7 + ((wd + 6) % 7)) * DAY_MS;
				if (day >= base) yield at(day);
			}
	} else if (rule.freq === "MONTHLY")
		for (let k = 0; ; k++) {
			const index = s.m - 1 + k * rule.interval;
			const y = s.y + Math.floor(index / 12);
			const mo = ((index % 12) + 12) % 12;
			for (const d of monthDays(y, mo, rule, s.d)) {
				const day = Date.UTC(y, mo, d);
				if (day >= base) yield at(day);
			}
		}
	else
		for (let k = 0; ; k++) {
			const y = s.y + k * rule.interval;
			for (const mo of [...(rule.byMonth.length ? rule.byMonth : [s.m])].sort((a, b) => a - b))
				for (const d of monthDays(y, mo - 1, rule, s.d)) {
					const day = Date.UTC(y, mo - 1, d);
					if (day >= base) yield at(day);
				}
		}
}

export function expand(ev: Pick<Ev, "start_min" | "duration_min" | "tz" | "rrule" | "until_min">, from: number, to: number): number[] {
	const rule = parseRule(ev.rrule);
	const out: number[] = [];
	let n = 0;
	let steps = 0;
	for (const start of starts(ev, rule)) {
		if (++steps > MAX_STEPS || start > to) break;
		if ((rule?.until != null && start > rule.until) || (ev.until_min != null && start > ev.until_min)) break;
		if (rule?.count != null && ++n > rule.count) break;
		if (start + ev.duration_min >= from) out.push(start);
	}
	return out;
}

function occurrencesOf(ev: Ev, exceptions: Map<number, Exception>, from: number, to: number) {
	const out: { key: number; start: number; duration: number; title: string | null; description: string | null }[] = [];
	for (const key of expand(ev, from - 14 * DAY, to + 14 * DAY)) {
		const x = exceptions.get(key);
		if (x?.cancelled) continue;
		const start = x?.start_min ?? key;
		const duration = x?.duration_min ?? ev.duration_min;
		if (start > to || start + duration < from) continue;
		out.push({ key, start, duration, title: x?.title ?? ev.title, description: x?.description ?? ev.description });
	}
	return out;
}

// --- reading

const EVENT = sql`e.id::text as id, e.organizer_id::text as organizer_id, e.title, e.description, e.start_min::text as start_min,
	e.duration_min, e.tz, e.rrule, e.all_day, e.call_code, e.until_min::text as until_min, e.cancelled`;

const toEv = (r: any): Ev => ({ ...r, start_min: Number(r.start_min), until_min: r.until_min == null ? null : Number(r.until_min) });

function windowOf(vars: Vars, fallback?: [number, number]): [number, number] {
	const now = Math.floor(Date.now() / 60_000);
	let from = minutes(vars.fromMin);
	let to = minutes(vars.toMin);
	if (from == null || to == null) [from, to] = fallback ?? [now - DAY, now + 60 * DAY];
	if (to < from) [from, to] = [to, from];
	return [from, Math.min(to, from + 800 * DAY)];
}

async function load(id: unknown): Promise<Ev> {
	if (!isId(id)) throw new ChatError("Event not found.");
	const [row] = await sql`select ${EVENT} from calendar_events e where e.id = ${id}::bigint and not e.cancelled`;
	if (!row) throw new ChatError("Event not found.");
	return toEv(row);
}

async function involved(v: Viewer, ev: Ev) {
	if (ev.organizer_id === v.id) return;
	const [row] = await sql`select 1 from calendar_attendees where event_id = ${ev.id}::bigint and user_id = ${v.id}::bigint`;
	if (!row) throw new ChatError("Event not found.");
}

function organizerOnly(v: Viewer, ev: Ev) {
	if (ev.organizer_id !== v.id) throw new ChatError("Only the organizer can change this call.");
}

const person = (r: any) => ({ ...r, id: gid("UserResults", r.rest_id), result: { ...r.result, id: gid("User", r.rest_id) } });

async function present(v: Viewer, evs: Ev[], from: number, to: number) {
	if (!evs.length) return [];
	const ids = sql.array(evs.map((e) => e.id), "INT8");
	const [attendees, exceptions, mine] = await Promise.all([
		sql`select event_id::text as event_id, user_id::text as user_id, rsvp from calendar_attendees where event_id = any(${ids}) order by user_id`,
		sql`select event_id::text as event_id, occurrence_start_min::text as key, cancelled, title, description, start_min::text as start_min, duration_min
			from calendar_exceptions where event_id = any(${ids})`,
		sql`select event_id::text as event_id, notify_before_min, metadata from calendar_viewer where user_id = ${v.id}::bigint and event_id = any(${ids})`,
	]);
	const userIds = [...new Set([...evs.map((e) => e.organizer_id), ...attendees.map((a: any) => a.user_id)])];
	const people = new Map((await userResults(v.id, userIds)).map((u: any) => [u.rest_id as string, person(u)]));
	return evs.map((ev) => {
		const exc = new Map<number, Exception>();
		for (const x of exceptions.filter((x: any) => x.event_id === ev.id))
			exc.set(Number(x.key), { cancelled: x.cancelled, title: x.title, description: x.description, start_min: x.start_min == null ? null : Number(x.start_min), duration_min: x.duration_min });
		const guests = attendees
			.filter((a: any) => a.event_id === ev.id && people.has(a.user_id))
			.map((a: any) => ({ __typename: "CalendarAttendee", rsvp_status: a.rsvp, user_results: people.get(a.user_id) }));
		const viewer = mine.find((m: any) => m.event_id === ev.id);
		return {
			__typename: "CalendarEvent",
			id: gid("CalendarEvent", ev.id),
			rest_id: ev.id,
			occurrences: occurrencesOf(ev, exc, from, to).map((o) =>
				compact({
					__typename: "CalendarOccurrence",
					occurrence_start_min: String(o.key),
					start_min: String(o.start),
					duration_min: o.duration,
					all_day: ev.all_day,
					tz: ev.tz,
					title: o.title,
					description: o.description,
					rrule: ev.rrule,
					status: "ACTIVE",
					organizer: people.get(ev.organizer_id),
					attendees: guests,
					kind: { __typename: "CallingEvent", meeting_url: meetingUrl(ev.call_code) },
					viewer_notify_before_min: viewer?.notify_before_min,
					viewer_metadata: viewer?.metadata,
				}),
			),
		};
	});
}

async function oneEvent(v: Viewer, ev: Ev, vars: Vars) {
	const [from, to] = windowOf(vars, [ev.start_min, ev.start_min + ev.duration_min]);
	const [event] = await present(v, [ev], from, to);
	return event;
}

// --- writing

function text(value: unknown, max: number, what: string): string | undefined {
	if (value == null) return undefined;
	if (typeof value !== "string" || value.length > max) throw new ChatError(`The ${what} is too long.`);
	return value;
}

function fieldsOf(event: Vars) {
	const start = event.start_min == null ? undefined : minutes(event.start_min);
	if (event.start_min != null && start == null) throw new ChatError("Invalid start time.");
	const now = Math.floor(Date.now() / 60_000);
	if (start != null && (start < now - 365 * DAY || start > now + 3 * 365 * DAY)) throw new ChatError("That start time is out of range.");
	const duration = event.duration_min == null ? undefined : Number(event.duration_min);
	if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 7 * DAY)) throw new ChatError("Invalid call length.");
	let rrule: string | null | undefined;
	if (event.rrule !== undefined) {
		const raw = text(event.rrule, 300, "repeat rule")?.trim() ?? "";
		if (raw && !parseRule(raw)) throw new ChatError("Invalid repeat rule.");
		rrule = raw || null;
	}
	return {
		start,
		duration,
		rrule,
		tz: event.tz == null ? undefined : zoneOf(event.tz),
		title: text(event.title, 200, "title")?.trim(),
		description: text(event.description, 4000, "description"),
		invitees: Array.isArray(event.attendee_user_ids) ? [...new Set(event.attendee_user_ids.map(String))] : undefined,
	};
}

async function checkInvitees(v: Viewer, invitees: string[] | undefined): Promise<string[] | undefined> {
	if (!invitees) return undefined;
	const ids = invitees.filter((id) => id !== v.id);
	if (ids.length > MAX_INVITEES || !ids.every(isId)) throw new ChatError("Someone you invited can't be added to this call.");
	if (!ids.length) return [];
	const found = await sql`select u.id::text as id from users u where u.id = any(${sql.array(ids, "INT8")})
		and u.instance is null and u.deactivated_at is null and u.status <> 'suspended'
		and not exists (select 1 from blocks b where (b.blocker_id = ${v.id}::bigint and b.blocked_id = u.id) or (b.blocker_id = u.id and b.blocked_id = ${v.id}::bigint))`;
	if (found.length !== ids.length) throw new ChatError("Someone you invited can't be added to this call.");
	return ids;
}

async function setInvitees(tx: typeof sql, eventId: string, ids: string[]) {
	await tx`delete from calendar_attendees where event_id = ${eventId}::bigint and not (user_id = any(${sql.array(ids, "INT8")}))`;
	for (const id of ids) await tx`insert into calendar_attendees (event_id, user_id) values (${eventId}::bigint, ${id}::bigint) on conflict do nothing`;
}

async function schedule(v: Viewer, vars: Vars) {
	if (v.status !== "active") throw new ChatError("Your account cannot schedule calls.");
	const f = fieldsOf(vars.event ?? {});
	if (f.start == null) throw new ChatError("Invalid start time.");
	const invitees = (await checkInvitees(v, f.invitees)) ?? [];
	const [{ n }] = await sql`select count(*)::int as n from calendar_events where organizer_id = ${v.id}::bigint and not cancelled`;
	if (n >= MAX_EVENTS) throw new ChatError("You have too many scheduled calls.");
	const id = newId();
	await sql.begin(async (tx) => {
		await tx`insert into calendar_events (id, organizer_id, title, description, start_min, duration_min, tz, rrule, call_code)
			values (${id}::bigint, ${v.id}::bigint, ${f.title ?? null}, ${f.description ?? null}, ${f.start}::bigint, ${f.duration ?? 60}, ${f.tz ?? "UTC"}, ${f.rrule ?? null}, ${callCode()})`;
		await setInvitees(tx as typeof sql, id, invitees);
	});
	return { data: { calendar_schedule_event: { __typename: "CalendarScheduleEventResult", event: await oneEvent(v, await load(id), vars) } } };
}

async function update(v: Viewer, vars: Vars) {
	const ev = await load(vars.eventId);
	organizerOnly(v, ev);
	const f = fieldsOf(vars.event ?? {});
	const invitees = await checkInvitees(v, f.invitees);
	const key = minutes(vars.occurrenceStartMin);
	const scope = ev.rrule ? scopeOf(vars.scope) : "ALL";
	let target = ev.id;
	await sql.begin(async (tx) => {
		if (scope === "THIS") {
			if (key == null) throw new ChatError("Missing occurrence.");
			await tx`insert into calendar_exceptions (event_id, occurrence_start_min, title, description, start_min, duration_min)
				values (${ev.id}::bigint, ${key}::bigint, ${f.title ?? null}, ${f.description ?? null}, ${f.start ?? null}::bigint, ${f.duration ?? null})
				on conflict (event_id, occurrence_start_min) do update set cancelled = false,
					title = coalesce(excluded.title, calendar_exceptions.title), description = coalesce(excluded.description, calendar_exceptions.description),
					start_min = coalesce(excluded.start_min, calendar_exceptions.start_min), duration_min = coalesce(excluded.duration_min, calendar_exceptions.duration_min)`;
			return;
		}
		const following = scope === "THIS_AND_FOLLOWING" && key != null && key > ev.start_min;
		let start = ev.start_min;
		if (following) start = f.start ?? key!;
		else if (f.start != null) start = key != null && ev.rrule ? ev.start_min + (f.start - key) : f.start;
		const row = {
			title: f.title ?? ev.title,
			description: f.description ?? ev.description,
			duration: f.duration ?? ev.duration_min,
			tz: f.tz ?? ev.tz,
			rrule: f.rrule === undefined ? ev.rrule : f.rrule,
		};
		if (following) {
			const rule = parseRule(row.rrule);
			if (f.rrule === undefined && row.rrule && rule?.count != null) {
				const before = expand({ ...ev, until_min: null }, 0, key! - 1).length;
				row.rrule = row.rrule.replace(/COUNT=\d+/i, `COUNT=${Math.max(1, rule.count - before)}`);
			}
			target = newId();
			await tx`update calendar_events set until_min = ${key! - 1}::bigint, updated_at = now() where id = ${ev.id}::bigint`;
			await tx`insert into calendar_events (id, organizer_id, title, description, start_min, duration_min, tz, rrule, call_code)
				values (${target}::bigint, ${ev.organizer_id}::bigint, ${row.title}, ${row.description}, ${start}::bigint, ${row.duration}, ${row.tz}, ${row.rrule}, ${callCode()})`;
			await tx`insert into calendar_attendees (event_id, user_id, rsvp) select ${target}::bigint, user_id, rsvp from calendar_attendees where event_id = ${ev.id}::bigint`;
		} else
			await tx`update calendar_events set title = ${row.title}, description = ${row.description}, start_min = ${start}::bigint, duration_min = ${row.duration},
				tz = ${row.tz}, rrule = ${row.rrule}, updated_at = now() where id = ${ev.id}::bigint`;
		if (invitees) await setInvitees(tx as typeof sql, target, invitees);
	});
	return { data: { calendar_update_event: { __typename: "CalendarScheduleEventResult", event: await oneEvent(v, await load(target), vars) } } };
}

async function rsvp(v: Viewer, vars: Vars) {
	const ev = await load(vars.eventId);
	if (!RSVPS.includes(vars.status)) throw new ChatError("Invalid response.");
	const changed = await sql`update calendar_attendees set rsvp = ${vars.status} where event_id = ${ev.id}::bigint and user_id = ${v.id}::bigint returning 1`;
	if (!changed.length) throw new ChatError("You were not invited to this call.");
	return { data: { calendar_rsvp_event: { __typename: "CalendarRsvpEventResult", event: await oneEvent(v, ev, vars) } } };
}

async function cancel(v: Viewer, vars: Vars) {
	const ev = await load(vars.eventId);
	organizerOnly(v, ev);
	const key = minutes(vars.occurrenceStartMin);
	const scope = ev.rrule ? scopeOf(vars.scope) : "ALL";
	if (scope === "THIS") {
		if (key == null) throw new ChatError("Missing occurrence.");
		await sql`insert into calendar_exceptions (event_id, occurrence_start_min, cancelled) values (${ev.id}::bigint, ${key}::bigint, true)
			on conflict (event_id, occurrence_start_min) do update set cancelled = true`;
	} else if (scope === "THIS_AND_FOLLOWING" && key != null && key > ev.start_min)
		await sql`update calendar_events set until_min = ${key - 1}::bigint, updated_at = now() where id = ${ev.id}::bigint`;
	else await sql`update calendar_events set cancelled = true, updated_at = now() where id = ${ev.id}::bigint`;
	return { data: { calendar_cancel_event: { __typename: "CalendarCancelEventResult", success: true } } };
}

async function reminder(v: Viewer, vars: Vars) {
	const ev = await load(vars.eventId);
	await involved(v, ev);
	const before = Number(vars.notifyBeforeMin);
	if (!Number.isInteger(before) || before < 0 || before > 10_080) throw new ChatError("Invalid reminder.");
	await sql`insert into calendar_viewer (event_id, user_id, notify_before_min) values (${ev.id}::bigint, ${v.id}::bigint, ${before})
		on conflict (event_id, user_id) do update set notify_before_min = excluded.notify_before_min`;
	return { data: { calendar_set_event_reminder: { __typename: "CalendarSetEventReminderResult", event: await oneEvent(v, ev, vars) } } };
}

function metadataText(value: unknown): string {
	if (typeof value !== "string" || value.length > 2000) throw new ChatError("Invalid metadata.");
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new ChatError("Invalid metadata.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ChatError("Invalid metadata.");
	return value;
}

async function eventMetadata(v: Viewer, vars: Vars) {
	const ev = await load(vars.eventId);
	await involved(v, ev);
	const metadata = metadataText(vars.metadata);
	await sql`insert into calendar_viewer (event_id, user_id, metadata) values (${ev.id}::bigint, ${v.id}::bigint, ${metadata})
		on conflict (event_id, user_id) do update set metadata = excluded.metadata`;
	return { data: { calendar_set_event_metadata: { __typename: "CalendarSetEventMetadataResult", event: await oneEvent(v, ev, vars) } } };
}

async function list(v: Viewer, vars: Vars) {
	const [from, to] = windowOf(vars);
	const rows = await sql`select ${EVENT} from calendar_events e
		where not e.cancelled and e.start_min <= ${to}::bigint and (e.rrule is not null or e.start_min + e.duration_min >= ${from}::bigint)
			and (e.until_min is null or e.until_min >= ${from}::bigint)
			and (e.organizer_id = ${v.id}::bigint or exists (select 1 from calendar_attendees a where a.event_id = e.id and a.user_id = ${v.id}::bigint))
		order by e.start_min limit 1000`;
	const [saved] = await sql`select metadata from calendar_user_metadata where user_id = ${v.id}::bigint`;
	const events = (await present(v, rows.map(toEv), from, to)).filter((e) => e.occurrences.length);
	return { data: { calendar_list_events: compact({ __typename: "CalendarListEventsResult", viewer_metadata: saved?.metadata, events }) } };
}

async function listUser(v: Viewer, vars: Vars) {
	const id = String(vars.restId ?? "");
	const user = { __typename: "User", id: gid("User", id) };
	if (id !== v.id) return { data: { user_result_by_rest_id: { __typename: "UserResults", id: gid("UserResults", id), result: user } } };
	const mine: any = await list(v, vars);
	return { data: { user_result_by_rest_id: { __typename: "UserResults", id: gid("UserResults", id), result: { ...user, calendar_events: { events: mine.data.calendar_list_events.events } } } } };
}

async function searchPeople(v: Viewer, vars: Vars) {
	const found: any = await chatHandlers.TypeaheadXChatQuery(v, { query: vars.query });
	const count = Math.max(1, Math.min(20, Number(vars.count) || 8));
	const items = found.data.search_by_raw_query.x_chat_users_typeahead
		.filter((i: any) => i.typeahead_user.user_results.rest_id !== v.id && i.typeahead_user.user_results.result.chat_permissions.can_dm !== false)
		.slice(0, count)
		.map((i: any) => ({ ...i, typeahead_user: { ...i.typeahead_user, user_results: person(i.typeahead_user.user_results) } }));
	return { data: { search_by_raw_query: { __typename: "SearchQuery", id: gid("SearchQuery", String(vars.query ?? "")), x_chat_users_typeahead: items } } };
}

async function colors(v: Viewer, vars: Vars) {
	const metadata = metadataText(vars.metadata);
	await sql`insert into calendar_user_metadata (user_id, metadata) values (${v.id}::bigint, ${metadata})
		on conflict (user_id) do update set metadata = excluded.metadata`;
	return { data: { calendar_set_metadata: { __typename: "CalendarSetMetadataResult", success: true } } };
}

export const calendarHandlers: Record<string, (viewer: Viewer, vars: Vars) => Promise<unknown> | unknown> = {
	scheduledCallsApiList: list,
	scheduledCallsApiListUser: listUser,
	scheduledCallsApiSearchPeople: searchPeople,
	scheduledCallsApiSchedule: schedule,
	scheduledCallsApiUpdate: update,
	scheduledCallsApiRsvp: rsvp,
	scheduledCallsApiCancel: cancel,
	scheduledCallsApiSetEventReminder: reminder,
	scheduledCallsApiSetEventMetadata: eventMetadata,
	calendarColorsSet: colors,
	externalCalendarLinksList: () => ({ data: { calendar_external_links: [] } }),
	scheduledCallsApiRefreshExternal: () => ({ data: { calendar_refresh_external: [] } }),
	scheduledCallsApiRespondExternal: () => ({ data: { calendar_respond_external_event: { __typename: "CalendarCancelEventResult", success: false } } }),
};
