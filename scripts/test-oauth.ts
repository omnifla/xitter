// Direct OAuth flow checks against a migrated, disposable local database.
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "../src/db";
import { newId } from "../src/ids";
import type { Viewer } from "../src/auth";
import { connectedAppsRoute, developerAppsRoute, oauthAuthorize, oauthToken, validRedirect } from "../src/oauth";
import { publicApi } from "../src/public-api";
import { PUBLIC_ORIGIN } from "../src/config";
import { fetcher } from "../src/oauth-metadata";
import "../src/admin"; // first: oauth-admin.ts and admin.ts import each other
import { oauthAppActions } from "../src/oauth-admin";

const database = new URL(process.env.DATABASE_URL ?? "postgres://localhost/xitter");
assert(["localhost", "127.0.0.1"].includes(database.hostname) && /test|codex/.test(database.pathname), "Use a disposable local test database.");

const developer = newId(), account = newId(), other = newId();
const viewer = (id: string) => ({ id, screen_name: `oauth_${id}`, status: "active", role: null, csrf: `csrf-${id}`, token: `session-${id}` }) as Viewer;
const appOwner = viewer(developer), user = viewer(account);
const registeredRedirect = "https://example.org/callback?source=xitter";
const origin = PUBLIC_ORIGIN;
const postForm = (path: string, fields: Record<string, string>) => new Request(`${origin}${path}`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });

async function approve(clientId: string, scope: "read" | "write" = "read", redirect = registeredRedirect) {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	const args = { response_type: "code", client_id: clientId, redirect_uri: redirect, state: "random-state-123", scope, code_challenge: challenge, code_challenge_method: "S256" };
	const url = new URL(`${origin}/oauth/authorize?${new URLSearchParams(args)}`);
	assert.equal((await oauthAuthorize(new Request(url), url, user)).status, 200, "consent page opens");
	const res = await oauthAuthorize(postForm("/oauth/authorize", { ...args, csrf: user.csrf, decision: "approve" }), url, user);
	assert.equal(res.status, 303);
	const callback = new URL(res.headers.get("location")!);
	assert.equal(callback.searchParams.get("state"), args.state);
	const expected = new URL(redirect);
	assert.equal(callback.origin + callback.pathname, expected.origin + expected.pathname);
	return { code: callback.searchParams.get("code")!, verifier, redirect };
}

const exchange = (clientId: string, grant: { code: string; verifier: string; redirect: string }, verifier = grant.verifier) => oauthToken(postForm("/oauth/token", {
	grant_type: "authorization_code", client_id: clientId, redirect_uri: grant.redirect, code: grant.code, code_verifier: verifier,
}));
const redirect = registeredRedirect;

try {
	for (const id of [developer, account, other]) await sql`insert into users(id, screen_name, name, password_hash) values(${id}::bigint, ${`oauth_${id}`}, 'OAuth test', 'unused')`;
	assert(!validRedirect("http://example.org/callback"), "plain HTTP remote redirect rejected");
	assert(!validRedirect("https://example.org/callback#fragment"), "fragment rejected");
	assert(validRedirect("http://127.0.0.1:3210/callback"), "loopback redirect allowed");
	assert.equal((await developerAppsRoute(postForm("/account/apps/developer", { csrf: "wrong", action: "register", name: "Bad", redirect_uri: redirect }), appOwner)).status, 403, "registration needs CSRF");
	const registered = await developerAppsRoute(postForm("/account/apps/developer", { csrf: appOwner.csrf, action: "register", name: "Example app", redirect_uri: redirect }), appOwner);
	assert.equal(registered.status, 200);
	const [client] = await sql`select id::text from oauth_clients where owner_id = ${developer}::bigint`;
	assert(client?.id);
	const wrongRedirect = new URL(`${origin}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: client.id, redirect_uri: "https://evil.example/callback", state: "random-state-123", scope: "read", code_challenge: createHash("sha256").update("a".repeat(43)).digest("base64url"), code_challenge_method: "S256" })}`);
	assert.equal((await oauthAuthorize(new Request(wrongRedirect), wrongRedirect, user)).status, 400, "unregistered redirect rejected");
	const bad = await approve(client.id);
	assert.equal((await exchange(client.id, bad, randomBytes(32).toString("base64url"))).status, 400, "wrong PKCE verifier rejected");
	assert.equal((await exchange(client.id, bad)).status, 400, "wrong verifier consumed the code");
	const grant = await approve(client.id);
	const tokenResponse = await exchange(client.id, grant);
	assert.equal(tokenResponse.status, 200);
	const issued = await tokenResponse.json();
	assert.equal(issued.scope, "read");
	assert.equal(issued.expires_in, 30 * 24 * 3600);
	assert.equal((await exchange(client.id, grant)).status, 400, "code cannot be replayed");
	const api = (method: string, path: string, token: string) => {
		const url = new URL(`${origin}/api/v1${path}`);
		return publicApi(new Request(url, { method, headers: { authorization: `Bearer ${token}` } }), url);
	};
	const me = await api("GET", "/me", issued.access_token);
	assert.equal((await me.json()).data.id, account, "app token accesses its user's account");
	assert.equal((await api("POST", "/posts", issued.access_token)).status, 403, "read grant cannot write");
	await sql`update api_tokens set expires_at = now() - interval '1 second' where user_id = ${account}::bigint and client_id = ${client.id}::bigint`;
	assert.equal((await api("GET", "/me", issued.access_token)).status, 401, "expired app token rejected");
	assert.equal((await connectedAppsRoute(postForm("/account/apps", { csrf: user.csrf, id: (await sql`select id::text from api_tokens where user_id = ${account}::bigint and client_id = ${client.id}::bigint`)[0].id }), user)).status, 200);
	assert.equal((await api("GET", "/me", issued.access_token)).status, 401, "user revocation takes effect");
	const writeGrant = await approve(client.id, "write");
	const writeToken = (await (await exchange(client.id, writeGrant)).json()).access_token;
	assert.equal((await developerAppsRoute(postForm("/account/apps/developer", { csrf: appOwner.csrf, action: "revoke", id: client.id }), appOwner)).status, 200);
	assert.equal((await api("GET", "/me", writeToken)).status, 401, "developer revocation takes effect");

	// an app identified by its client ID metadata document, never registered here
	const doc = `https://mobile-${account}.example/oauth-client.json`, docRedirect = `https://mobile-${account}.example/`;
	const realGet = fetcher.get;
	fetcher.get = async (url: string) => (url === doc ? JSON.stringify({ client_id: doc, client_name: "xit mob", redirect_uris: [docRedirect] }) : undefined);
	const docPage = new URL(`${origin}/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: doc, redirect_uri: docRedirect, state: "random-state-123", scope: "write", code_challenge: "a".repeat(43), code_challenge_method: "S256" })}`);
	const consent = await (await oauthAuthorize(new Request(docPage), docPage, user)).text();
	assert(consent.includes("xit mob") && consent.includes(`From mobile-${account}.example`), "consent page names the app and its host");
	const offList = new URL(docPage);
	offList.searchParams.set("redirect_uri", `https://mobile-${account}.example/elsewhere`);
	assert.equal((await oauthAuthorize(new Request(offList), offList, user)).status, 400, "redirect outside the document rejected");
	assert.equal((await exchange(doc, { code: "x".repeat(43), verifier: "v".repeat(43), redirect: docRedirect })).status, 400, "no grant before approval");
	const docGrant = await approve(doc, "write", docRedirect);
	const docToken = await exchange(doc, docGrant);
	assert.equal(docToken.status, 200, "metadata-document app gets a token");
	const docAccess = (await docToken.json()).access_token;
	assert.equal((await (await api("GET", "/me", docAccess)).json()).data.id, account, "its token works");
	const [docClient] = await sql`select id::text, owner_id from oauth_clients where metadata_url = ${doc}`;
	assert(docClient && docClient.owner_id === null, "approval made an ownerless client row");
	assert((await (await connectedAppsRoute(new Request(`${origin}/account/apps`), user)).text()).includes(`mobile-${account}.example · Read and write`), "Connected apps shows the app's domain");
	await approve(doc, "write", docRedirect);
	assert.equal((await sql`select count(*)::int as n from oauth_clients where metadata_url = ${doc}`)[0].n, 1, "approving again reuses the row");
	// Admin > OAuth apps lists it and blocks it
	const staff = { ...viewer(developer), role: "admin" } as Viewer;
	const listedApps = (await oauthAppActions.oauthApps.run(staff, {})) as { apps: { id: string; metadata_url: string | null; grants: number }[] };
	assert.equal(listedApps.apps.find((x) => x.id === docClient.id)?.grants, 1, "the admin list shows the ownerless app and its grant");
	await oauthAppActions.blockOAuthApp.run(staff, { id: docClient.id, reason: "spam" });
	assert.equal((await api("GET", "/me", docAccess)).status, 401, "blocking ends its grants");
	assert.equal((await oauthAuthorize(new Request(docPage), docPage, user)).status, 400, "a blocked app can't ask again");
	await oauthAppActions.unblockOAuthApp.run(staff, { id: docClient.id });
	assert.equal((await oauthAuthorize(new Request(docPage), docPage, user)).status, 200, "unblocking lets it ask again");
	await assert.rejects(oauthAppActions.unblockOAuthApp.run(staff, { id: client.id }), "a developer's revoke isn't lifted by unblock");
	await sql`delete from oauth_clients where id = ${docClient.id}::bigint`;
	// blocking a document URL nobody has approved yet
	await oauthAppActions.blockOAuthApp.run(staff, { url: doc, reason: "known bad" });
	assert.equal((await oauthAuthorize(new Request(docPage), docPage, user)).status, 400, "a pre-emptively blocked app can't ask");
	await assert.rejects(oauthAppActions.blockOAuthApp.run(staff, { url: "http://not-https.example/x.json" }), "only client ID URLs can be blocked by address");
	await sql`delete from oauth_clients where metadata_url = ${doc}`;
	fetcher.get = realGet;
	console.log("OAuth registration, consent, PKCE, scope, replay, revocation, client metadata document and admin block checks passed");
} finally {
	await sql`delete from users where id in (${developer}::bigint, ${account}::bigint, ${other}::bigint)`;
	await sql.close();
}
