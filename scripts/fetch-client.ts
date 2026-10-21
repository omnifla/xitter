// Pins a client build and downloads it into the local archive.
//
//   bun scripts/fetch-client.ts                        pin the current build without an account (first run),
//                                                      then only download files for the pinned build
//   bun scripts/fetch-client.ts --latest               re-pin the current build without an account
//   bun scripts/fetch-client.ts --token <auth_token>   signed-in x.com/home of any account
//   bun scripts/fetch-client.ts --har <file.har>       a capture that contains x.com/home
//
// The token may also come from TWITTER_AUTH_TOKEN. Only build data is kept: the
// page's account details are thrown away.
//
// Without an account: signed-out x.com pages are now a different app (x-web),
// but /i/tweetdeck still boots this client for guests. Its feature switches are
// the guest set, and it has no chat build address, which chat.x.com publishes.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_FILE, type Build, RUNTIME_FILE } from "../src/build";
import { CDN_ORIGIN, CLIENT_DIR, getClientFile, readCached } from "../src/client-cache";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const STATE = /window\.__INITIAL_STATE__=(\{.*?\});window\.__META_DATA__=(\{.*?\});/s;
// page metadata that describes the build, not the account
const META_KEYS = ["env", "isCanary", "isTwoffice", "hasMultiAccountCookie", "uaParserTags", "cookies", "xchatEmbedBuild", "xcallsEmbedBuild"];

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
}

async function pageFromToken(token: string): Promise<string> {
	const res = await fetch("https://x.com/home", { headers: { cookie: `auth_token=${token}`, "user-agent": UA }, redirect: "follow" });
	const html = await res.text();
	if (!STATE.test(html)) throw new Error(`x.com/home did not return the client page (status ${res.status}, ${res.url}); is the token valid?`);
	return html;
}

async function pageAsGuest(): Promise<string> {
	const res = await fetch("https://x.com/i/tweetdeck", { headers: { "user-agent": UA }, redirect: "follow" });
	const html = await res.text();
	if (!STATE.test(html)) throw new Error(`x.com/i/tweetdeck did not return the client page (status ${res.status}, ${res.url}); try --token`);
	return html;
}

// the signed-in page names the chat build in its metadata; the guest page doesn't
async function embedBuildAddress(host: string, app: string): Promise<string | undefined> {
	const res = await fetch(`https://${host}.x.com/embed-v1.json`, { headers: { "user-agent": UA } }).catch(() => undefined);
	const path = res?.ok ? ((await res.json().catch(() => undefined)) as any)?.metaData?.publicPath : undefined;
	return typeof path === "string" && new RegExp(`^https://abs\\.twimg\\.com/x-web/${app}/embed/[0-9a-f]+/$`).test(path) ? path : undefined;
}

function pageFromHar(file: string): string {
	const har = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
	for (const e of har.log.entries) {
		const text: string | undefined = e.response?.content?.text;
		if (text && /^https:\/\/x\.com\/home/.test(e.request.url) && STATE.test(text)) return text;
	}
	throw new Error(`${file} has no signed-in x.com/home page`);
}

function snapshot(html: string): { build: Build; runtime: string } {
	const m = STATE.exec(html)!;
	const state = JSON.parse(m[1]);
	const meta = JSON.parse(m[2]);
	const scripts = [...html.matchAll(/<script[^>]*src="https:\/\/abs\.twimg\.com(\/responsive-web\/client-web\/[^"]+\.js)"/g)].map((x) => x[1]);
	const runtime = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).find((b) => b.includes("__SCRIPTS_LOADED__.runtime=!0"));
	if (!scripts.length || !runtime) throw new Error("page has no entry scripts or no module loader");
	const fs = state.featureSwitch;
	return {
		build: {
			sha: meta.sha,
			scripts,
			featureSwitch: {
				defaultConfig: fs.defaultConfig,
				config: fs.user.config,
				featureSetToken: fs.featureSetToken,
				settingsVersion: fs.user.settingsVersion,
			},
			meta: Object.fromEntries(META_KEYS.filter((k) => k in meta).map((k) => [k, meta[k]])),
			fetchedAt: new Date().toISOString(),
		},
		runtime,
	};
}

const token = arg("--token") ?? process.env.TWITTER_AUTH_TOKEN;
const harFile = arg("--har");
const guest = !token && !harFile && (process.argv.includes("--latest") || !existsSync(BUILD_FILE));
if (token || harFile || guest) {
	const { build, runtime } = snapshot(harFile ? pageFromHar(harFile) : token ? await pageFromToken(token) : await pageAsGuest());
	if (!build.meta.xchatEmbedBuild) {
		const chat = await embedBuildAddress("chat", "xchat");
		if (chat) build.meta.xchatEmbedBuild = chat;
		else console.log("no chat build address found; chat won't load");
	}
	mkdirSync(CLIENT_DIR, { recursive: true });
	writeFileSync(BUILD_FILE, JSON.stringify(build, null, "\t"));
	writeFileSync(RUNTIME_FILE, runtime);
	console.log(`pinned build ${build.sha.slice(0, 12)}: ${build.scripts.length} entry scripts, ${Object.keys(build.featureSwitch.config).length} feature switches`);
}

// entry scripts, plus every file a capture saw if samples/ exists
const build: Build = JSON.parse(readFileSync(BUILD_FILE, "utf8"));
if (!build.meta.xcallsEmbedBuild) {
	const calls = await embedBuildAddress("call", "xcalls");
	if (calls) {
		build.meta.xcallsEmbedBuild = calls;
		writeFileSync(BUILD_FILE, JSON.stringify(build, null, "\t"));
	} else console.log("no calls build address found; calls won't load");
}
const paths = new Set(build.scripts);
if (existsSync("samples"))
	for (const d of readdirSync("samples")) {
		const list = join("samples", d, "_client-files.txt");
		if (!existsSync(list)) continue;
		for (const line of readFileSync(list, "utf8").split("\n"))
			if (line.startsWith(`${CDN_ORIGIN}/`)) paths.add(new URL(line.trim()).pathname);
	}

const queue = [...paths].filter((p) => !readCached(p));
let failed = 0;
await Promise.all(
	Array.from({ length: 8 }, async () => {
		for (let p = queue.pop(); p; p = queue.pop())
			if (!(await getClientFile(p))) {
				failed++;
				console.log(`failed: ${p}`);
			}
	}),
);
console.log(`${paths.size} files known, ${paths.size - failed} in the archive; the rest load on first use`);
