import { createUser } from "../src/auth";
import { expand } from "../src/calendar";
import { sql } from "../src/db";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
const password = crypto.randomUUID();
const suffix = Date.now().toString(36);
type Account = { id: string; name: string; cookie: string; csrf: string };
const accounts: Account[] = [];
let checks = 0;
function check(label: string, ok: unknown) {
	if (!ok) throw new Error(label);
	checks++;
	console.log(`ok  ${label}`);
}

async function gql(account: Account, name: string, variables: object = {}, method = "POST") {
	const headers = { cookie: account.cookie, "x-csrf-token": account.csrf, "content-type": "application/json" };
	const url = `${origin}/i/api/graphql/test/${name}`;
	const response = method === "GET"
		? await fetch(`${url}?variables=${encodeURIComponent(JSON.stringify(variables))}`, { headers })
		: await fetch(url, { method, headers, body: JSON.stringify({ variables }) });
	return { status: response.status, body: (await response.json().catch(() => ({}))) as any };
}

async function join(account: Account, code: string) {
	const response = await fetch(`${origin}/i/api/xcalls/batch`, {
		method: "POST",
		headers: { cookie: account.cookie, "x-csrf-token": account.csrf, "content-type": "application/json" },
		body: JSON.stringify({ batch_id: "b", deadline_ms: 5000, items: [{ service: "calling", method: "POST", path: "/xai.xchat_calling.v1.XChatCallingService/JoinCall", body: { call_id: code } }] }),
	});
	return (await response.text()).trim().split("\n").map((l) => JSON.parse(l)).find((l) => l.type === "item");
}

const minute = (iso: string) => Date.parse(iso) / 60_000;
const failed = (r: { body: any }) => (r.body.errors?.length ?? 0) > 0;
const now = Math.floor(Date.now() / 60_000);

const rule = (start: number, rrule: string, tz = "UTC", count = 12) => expand({ start_min: start, duration_min: 60, tz, rrule, until_min: null }, start, start + 800 * 1440).slice(0, count);

try {
	const monday = minute("2026-01-05T14:00:00Z");
	check("daily with a count", JSON.stringify(rule(monday, "FREQ=DAILY;COUNT=3")) === JSON.stringify([monday, monday + 1440, monday + 2880]));
	check("weekly on chosen days", JSON.stringify(rule(monday, "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4")) === JSON.stringify([monday, monday + 2880, monday + 10080, monday + 12960]));
	check("every other week", rule(monday, "FREQ=WEEKLY;INTERVAL=2;COUNT=3")[2] === monday + 4 * 10080);
	check("monthly on the 31st skips short months", rule(minute("2026-01-31T10:00:00Z"), "FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3").map((m) => new Date(m * 60_000).getUTCMonth()).join() === "0,2,4");
	check("monthly on the last Friday", new Date(rule(minute("2026-01-30T10:00:00Z"), "FREQ=MONTHLY;BYDAY=-1FR;COUNT=2")[1] * 60_000).toISOString().slice(0, 10) === "2026-02-27");
	check("yearly", new Date(rule(minute("2026-03-14T10:00:00Z"), "FREQ=YEARLY;COUNT=2")[1] * 60_000).toISOString().slice(0, 10) === "2027-03-14");
	check("until ends the series", rule(monday, "FREQ=DAILY;UNTIL=20260107").length === 3);
	const ny = rule(minute("2026-10-26T13:00:00Z"), "FREQ=WEEKLY;COUNT=3", "America/New_York");
	const hours = ny.map((m) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(m * 60_000))));
	check("a weekly call keeps its local time across the clocks changing", hours.join() === "9,9,9" && ny[1] - ny[0] === 10080 + 60);

	for (const [i, role] of ["organizer", "invitee", "outsider"].entries()) {
		const name = `cal${suffix}${role[0]}${i}`;
		const id = await createUser(name, name, password);
		const response = await fetch(`${origin}/login`, { method: "POST", body: new URLSearchParams({ username: name, password }), redirect: "manual" });
		const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]);
		accounts.push({ id, name, cookie: cookies.join("; "), csrf: cookies.find((value) => value.startsWith("ct0="))!.slice(4) });
	}
	const [a, b, c] = accounts;
	const window = { fromMin: String(now), toMin: String(now + 30 * 1440) };
	const listed = async (who: Account) => (await gql(who, "scheduledCallsApiList", window, "GET")).body.data.calendar_list_events.events as any[];
	const occurrences = async (who: Account) => (await listed(who)).flatMap((e) => e.occurrences);
	const start = now + 2 * 1440 + 15;

	check("an empty calendar lists no events", (await listed(a)).length === 0);

	const found = (await gql(a, "scheduledCallsApiSearchPeople", { query: b.name, count: 8 }, "GET")).body.data.search_by_raw_query.x_chat_users_typeahead;
	check("people search finds an account with its ids", found.length === 1 && found[0].typeahead_user.user_results.rest_id === b.id && !!found[0].typeahead_user.user_results.id && !!found[0].typeahead_user.user_results.result.id);
	check("people search leaves the searcher out", (await gql(b, "scheduledCallsApiSearchPeople", { query: b.name, count: 8 }, "GET")).body.data.search_by_raw_query.x_chat_users_typeahead.length === 0);

	const event = { start_min: String(start), duration_min: 45, title: "Standup", description: "Weekly", tz: "Asia/Tokyo", attendee_user_ids: [b.id], kind: { calling: {} } };
	check("a bad start time is refused", failed(await gql(a, "scheduledCallsApiSchedule", { event: { ...event, start_min: "soon" }, ...window })));
	check("an invitee that does not exist is refused", failed(await gql(a, "scheduledCallsApiSchedule", { event: { ...event, attendee_user_ids: ["9223372036854775000"] }, ...window })));
	check("a repeat rule that is not one is refused", failed(await gql(a, "scheduledCallsApiSchedule", { event: { ...event, rrule: "sometimes" }, ...window })));
	check("a signed-out request is refused", (await fetch(`${origin}/i/api/graphql/test/scheduledCallsApiSchedule`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status >= 400);

	const made = await gql(a, "scheduledCallsApiSchedule", { event, emailGuests: null, ...window });
	const created = made.body.data?.calendar_schedule_event?.event;
	const first = created?.occurrences?.[0];
	check("scheduling returns the event with its call link", !!created?.rest_id && first?.kind?.__typename === "CallingEvent" && first.kind.meeting_url.startsWith(`${origin}/i/call/`));
	check("the organizer and invitee come back as users", first.organizer.result.rest_id === a.id && first.attendees.length === 1 && first.attendees[0].user_results.result.rest_id === b.id);
	const code = first.kind.meeting_url.split("/").pop();

	const mine = (await occurrences(a))[0];
	check("the organizer lists it", mine.title === "Standup" && mine.start_min === String(start) && mine.occurrence_start_min === String(start) && mine.duration_min === 45 && mine.tz === "Asia/Tokyo" && mine.status === "ACTIVE");
	check("the invitee lists it, waiting for an answer", (await occurrences(b))[0].attendees[0].rsvp_status === "NEEDS_ACTION");
	check("a stranger does not see it", (await listed(c)).length === 0);
	check("nor another account's events", (await gql(c, "scheduledCallsApiListUser", { restId: a.id, ...window }, "GET")).body.data.user_result_by_rest_id.result.calendar_events == null);
	check("one's own events come through the user query", (await gql(a, "scheduledCallsApiListUser", { restId: a.id, ...window }, "GET")).body.data.user_result_by_rest_id.result.calendar_events.events.length === 1);
	check("events outside the window are left out", (await gql(a, "scheduledCallsApiList", { fromMin: String(now + 20 * 1440), toMin: String(now + 25 * 1440) }, "GET")).body.data.calendar_list_events.events.length === 0);

	const id = created.rest_id;
	const rsvp = (who: Account, status: string) => gql(who, "scheduledCallsApiRsvp", { eventId: id, occurrenceStartMin: String(start), scope: "THIS", status, ...window });
	check("an invitee can answer", (await rsvp(b, "ACCEPTED")).body.data.calendar_rsvp_event.event.occurrences[0].attendees[0].rsvp_status === "ACCEPTED");
	check("and the organizer sees the answer", (await occurrences(a))[0].attendees[0].rsvp_status === "ACCEPTED");
	check("a stranger cannot answer", failed(await rsvp(c, "ACCEPTED")));
	check("an answer must be one of the three", failed(await rsvp(b, "MAYBE")));

	const remind = (who: Account, minutes: number) => gql(who, "scheduledCallsApiSetEventReminder", { eventId: id, occurrenceStartMin: String(start), scope: "THIS", notifyBeforeMin: minutes, ...window });
	check("a reminder is kept for who set it", (await remind(b, 15)).body.data.calendar_set_event_reminder.event.occurrences[0].viewer_notify_before_min === 15 && (await occurrences(b))[0].viewer_notify_before_min === 15 && (await occurrences(a))[0].viewer_notify_before_min == null);
	check("a reminder has limits", failed(await remind(b, 20000)) && failed(await remind(c, 10)));
	const meta = (who: Account, metadata: string) => gql(who, "scheduledCallsApiSetEventMetadata", { eventId: id, occurrenceStartMin: String(start), scope: "THIS", metadata, ...window });
	check("an event colour is kept for who set it", (await meta(b, '{"color":"red"}')).body.data.calendar_set_event_metadata.event.occurrences[0].viewer_metadata === '{"color":"red"}' && (await occurrences(a))[0].viewer_metadata == null);
	check("metadata must be an object", failed(await meta(b, "[1]")) && failed(await meta(b, "nope")));
	check("calendar colours are saved", (await gql(a, "calendarColorsSet", { metadata: '{"x":1}' })).body.data.calendar_set_metadata.success === true && (await gql(a, "scheduledCallsApiList", window, "GET")).body.data.calendar_list_events.viewer_metadata === '{"x":1}');

	const patch = (who: Account, event: object, scope = "ALL", occurrenceStartMin: string | null = String(start)) => gql(who, "scheduledCallsApiUpdate", { eventId: id, occurrenceStartMin, scope, event, emailGuests: null, ...window });
	check("only the organizer can change it", failed(await patch(b, { title: "Mine now" })));
	check("a change to the title and length", !failed(await patch(a, { title: "Retro", duration_min: 30 })) && (await occurrences(a))[0].title === "Retro" && (await occurrences(a))[0].duration_min === 30);
	check("moving it moves the time", !failed(await patch(a, { start_min: String(start + 60) })) && (await occurrences(a))[0].start_min === String(start + 60));
	check("the invitees can be replaced", !failed(await patch(a, { attendee_user_ids: [c.id] })) && (await listed(c)).length === 1 && (await listed(b)).length === 0);
	check("and the old invitee no longer lists it", (await occurrences(b)).length === 0);
	check("a repeat can be set later", !failed(await patch(a, { rrule: "FREQ=DAILY;COUNT=4" }, "ALL", null)));

	const series = await occurrences(a);
	const keys = series.map((o) => o.occurrence_start_min);
	check("it now lists every occurrence", series.length === 4 && series[1].start_min === String(Number(series[0].start_min) + 1440));
	check("one occurrence can be changed alone", !failed(await patch(a, { title: "Just this", start_min: String(Number(keys[1]) + 30) }, "THIS", keys[1])) && (await occurrences(a)).find((o) => o.occurrence_start_min === keys[1])!.title === "Just this" && (await occurrences(a)).filter((o) => o.title === "Retro").length === 3);
	check("one occurrence can be cancelled", (await gql(a, "scheduledCallsApiCancel", { eventId: id, occurrenceStartMin: keys[2], scope: "THIS", emailGuests: null })).body.data.calendar_cancel_event.success === true && (await occurrences(a)).length === 3);
	check("this and following splits the series", !failed(await patch(a, { title: "From here" }, "THIS_AND_FOLLOWING", keys[3])) && (await occurrences(a)).map((o) => o.title).join() === "Retro,Just this,From here");
	check("and gives the new part its own call link", new Set((await listed(a)).map((e) => e.occurrences[0].kind.meeting_url)).size === 2);
	check("this and following can end a series", (await gql(a, "scheduledCallsApiCancel", { eventId: id, occurrenceStartMin: keys[1], scope: "THIS_AND_FOLLOWING", emailGuests: null })).body.data.calendar_cancel_event.success === true && (await occurrences(a)).length === 2);
	check("only the organizer can cancel", failed(await gql(c, "scheduledCallsApiCancel", { eventId: id, occurrenceStartMin: keys[0], scope: "ALL", emailGuests: null })));
	check("a whole event can be cancelled", (await gql(a, "scheduledCallsApiCancel", { eventId: id, occurrenceStartMin: keys[0], scope: "ALL", emailGuests: null })).body.data.calendar_cancel_event.success === true);

	const later = await gql(a, "scheduledCallsApiSchedule", { event: { ...event, attendee_user_ids: [b.id], title: "Open" }, ...window });
	const meeting = later.body.data.calendar_schedule_event.event.occurrences[0].kind.meeting_url.split("/").pop();
	const joined = await join(b, meeting);
	check("opening the meeting link makes the call", joined.status === "OK" && joined.body.x_chat_join_call_result.call.call_id === meeting);
	const preJoin = await gql(c, "xCallsGetCallPreJoinData", { call_id: meeting }, "GET");
	check("anyone with the link can see it", preJoin.body.data?.xchat_get_call_pre_join_data?.viewer_may_join === true && preJoin.body.data.xchat_get_call_pre_join_data.member_count === 1);
	check("a cancelled event's link is no call", (await join(c, code)).status !== "OK");

	const linked = await gql(a, "externalCalendarLinksList", {});
	check("no outside calendars are linked", linked.body.data.calendar_external_links.length === 0 && (await gql(a, "scheduledCallsApiRefreshExternal", { fromMin: window.fromMin, toMin: window.toMin })).body.data.calendar_refresh_external.length === 0);
	console.log(`\n${checks} checks passed`);
} finally {
	for (const account of accounts) await sql`delete from users where id = ${account.id}::bigint`;
	await sql.close();
}
