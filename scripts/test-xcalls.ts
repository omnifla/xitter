import { createUser } from "../src/auth";
import { sql } from "../src/db";

const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
const password = crypto.randomUUID();
const suffix = Date.now().toString(36);
type Account = { id: string; cookie: string; csrf: string };
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
	return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

async function batch(account: Account, items: object[]) {
	const response = await fetch(`${origin}/i/api/xcalls/batch`, {
		method: "POST",
		headers: { cookie: account.cookie, "x-csrf-token": account.csrf, "content-type": "application/json" },
		body: JSON.stringify({ batch_id: "b_test", deadline_ms: 5000, items }),
	});
	const lines = (await response.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
	return { status: response.status, type: response.headers.get("content-type"), items: lines.filter((l) => l.type === "item"), done: lines.find((l) => l.type === "done") };
}

const calling = (rpc: string, body: object) => ({ service: "calling", method: "POST", path: `/xai.xchat_calling.v1.XChatCallingService/${rpc}`, body });

try {
	for (let i = 0; i < 3; i++) {
		const name = `call${suffix}${i}`;
		const id = await createUser(name, name, password);
		const response = await fetch(`${origin}/login`, { method: "POST", body: new URLSearchParams({ username: name, password }), redirect: "manual" });
		const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]);
		accounts.push({ id, cookie: cookies.join("; "), csrf: cookies.find((value) => value.startsWith("ct0="))!.slice(4) });
	}
	const [a, b, outsider] = accounts;
	const [low, high] = BigInt(a.id) < BigInt(b.id) ? [a.id, b.id] : [b.id, a.id];
	const conversation = `${low}:${high}`;

	const started = await batch(a, [calling("StartCall", { audio_only: true, conversation_id: conversation })]);
	check("batch answers ndjson", started.status === 200 && started.type?.startsWith("application/x-ndjson"));
	const start = started.items[0];
	const call = start?.body?.x_chat_start_call_result?.call;
	check("StartCall item is OK", start?.status === "OK" && start.index === 0);
	check("call id is xxx-xxx-xxx", /^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/.test(call?.call_id));
	check("call carries conversation, host and audio_only", call.conversation_id === conversation && call.host_user_id === a.id && call.audio_only === true);
	check("host is the only participant", call.participants.length === 1 && call.participants[0].is_host && call.participants[0].user_id === a.id);
	check("call is p2p", call.p2p === true);
	check("created_at_ms is a string of digits", /^\d{13}$/.test(call.created_at_ms));
	const media = JSON.parse(start.body.x_chat_start_call_result.media_credentials.payload);
	check("media credentials: p2p backend and ice servers", media.media_backend === "p2p" && Array.isArray(media.ice_servers.uris) && media.ice_servers.uris.length > 0);
	check("done maps $0 to the call id", started.done.ids.$0 === call.call_id && started.done.batch_id === "b_test" && started.done.error === null);
	const id = call.call_id;

	const second = await batch(a, [calling("StartCall", { audio_only: true, conversation_id: conversation })]);
	check("second live call in the conversation is refused", second.items[0].status === "FAILED_PRECONDITION");
	const refused = await batch(outsider, [calling("StartCall", { audio_only: true, conversation_id: conversation })]);
	check("non-member cannot start a call there", refused.items[0].status === "FAILED_PRECONDITION");

	const token = await batch(b, [calling("RequestToken", { call_id: id })]);
	const grant = token.items[0].body.x_chat_request_token_result;
	check("RequestToken returns the room and ice servers", token.items[0].status === "OK" && grant.room_id === id && grant.stream_name === id && grant.ice_urls.length > 0);
	check("no media gateway is offered", grant.gw_url === null && grant.stream_jwt === null);
	check("RequestToken maps $0 to the call id", token.done.ids.$0 === id);
	check("outsider cannot get a token", (await batch(outsider, [calling("RequestToken", { call_id: id })])).items[0].status === "FAILED_PRECONDITION");

	const joined = await batch(b, [calling("JoinCall", { audio_only: true, call_id: id, publisher_feed_id: "con_p_test" })]);
	const joinedCall = joined.items[0].body.x_chat_join_call_result.call;
	check("JoinCall adds the second participant", joined.items[0].status === "OK" && joinedCall.participants.length === 2 && joinedCall.participants.some((p: any) => p.user_id === b.id && !p.is_host));
	check("outsider cannot join", (await batch(outsider, [calling("JoinCall", { call_id: id })])).items[0].status === "FAILED_PRECONDITION");

	const mixed = await batch(a, [{ service: "rtc", method: "POST", path: "/sessions", pin: "$0.gw_url", body: {} }, calling("Nope", {}), calling("RequestToken", { call_id: id })]);
	check("rtc items and unknown RPCs are UNIMPLEMENTED", mixed.items[0].status === "UNIMPLEMENTED" && mixed.items[1].status === "UNIMPLEMENTED");
	check("later items still run after unimplemented ones", mixed.items[2].status === "OK" && mixed.items[2].index === 2);

	const sent = await gql(a, "xCallsSendSignal", { callId: id, sessionId: "sess-a", kind: "offer", payload: JSON.stringify({ sdp: "v=0" }), seq: 1 });
	check("host sends a signal", sent.body?.data?.xchat_send_signal?.success === true);
	check("outsider cannot send a signal", sent.body && (await gql(outsider, "xCallsSendSignal", { callId: id, sessionId: "x", kind: "offer", payload: "{}", seq: 1 })).body?.data?.xchat_send_signal?.success !== true);
	const fetched = await gql(b, "xCallsFetchSignals", { callId: id, sessionId: "sess-b" });
	const signals = fetched.body?.data?.xchat_fetch_signals?.signals;
	check("callee fetches the signal", signals?.length === 1 && signals[0].sender_session_id === "sess-a" && signals[0].kind === "offer" && signals[0].seq === 1 && signals[0].payload === JSON.stringify({ sdp: "v=0" }) && typeof signals[0].sent_at_msec === "number");
	check("a repeat fetch is empty", (await gql(b, "xCallsFetchSignals", { callId: id, sessionId: "sess-b" })).body?.data?.xchat_fetch_signals?.signals?.length === 0);
	check("the sender does not get its own signal", (await gql(a, "xCallsFetchSignals", { callId: id, sessionId: "sess-a" })).body?.data?.xchat_fetch_signals?.signals?.length === 0);
	await gql(b, "xCallsSendSignal", { callId: id, sessionId: "sess-b", kind: "answer", payload: "{}", seq: 1 });
	check("answer reaches the host", (await gql(a, "xCallsFetchSignals", { callId: id, sessionId: "sess-a" })).body?.data?.xchat_fetch_signals?.signals?.[0]?.kind === "answer");

	const auth = await gql(a, "xCallsGenerateAuthToken", { callId: id }, "GET");
	check("GenerateAuthToken works as a GET", auth.status === 200 && typeof auth.body?.data?.xchat_generate_call_auth_token?.token === "string");

	const left = await gql(a, "xCallsLeaveCall", { callId: id, mediaSessionId: null });
	check("host leaves", left.body?.data?.xchat_leave_call?.success === true);
	const [row] = await sql`select status from xcalls_calls where id = ${id}`;
	check("host leaving ends the call", row.status === "ended");
	check("ended call refuses tokens", (await batch(b, [calling("RequestToken", { call_id: id })])).items[0].status === "FAILED_PRECONDITION");
	const again = await batch(a, [calling("StartCall", { audio_only: false, conversation_id: conversation })]);
	check("a new call can start once the old one ended", again.items[0].status === "OK" && again.items[0].body.x_chat_start_call_result.call.audio_only === false);

	console.log(`\n${checks} checks passed`);
} finally {
	for (const account of accounts) await sql`delete from users where id = ${account.id}::bigint`.catch(() => {});
	await sql.close();
}