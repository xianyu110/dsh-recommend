import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
//#region src/host/web.ts
/**
* dsh-recommend web 半：把本地缓存的 registry.json / history.json 以同源路由供给浏览器，
* 提供 POST /dsh-recommend/sync 供设置页「刷新数据」按钮触发更新，
* 并提供 POST /dsh-recommend/install 供设置页「一键安装」按钮触发 `dsh plugin add`（M3）。
*
* 独立成行（而非并入 host 工具半）是因为 cordis 的 inject 是强依赖：
* webServer 只在 web profile 存在，headless 下挂载本行会永远 PENDING。
* 所以 tools 半（main）不带 webServer，本半（./web）带，由 patch 分两行挂载。
*
* 安装安全边界：
*   1. 客户端只能按 fullName 安装，spec 由服务端从缓存 registry 构造
*      （`github:owner/repo`），绝不接受客户端传来的任意字符串 —— 防注入；
*   2. Origin 校验：仅接受同源（或空 Origin，如 curl 本机）请求 —— 防 CSRF
*      （恶意网页让本地 DSH 装任意插件）；
*   3. 安装命令交给官方 `dsh plugin --profile <name> add <spec>`，由它完成
*      profile 初始化、pnpm 安装与 bundles 对账，本行只转发输出。
*/
const name = "dsh-recommend-web";
const inject = ["webServer"];
/** 安装超时：pnpm 拉取 git 依赖可能很慢，给足 10 分钟。 */
const INSTALL_TIMEOUT_MS = 6e5;
function apply(ctx, config) {
	const historyPath = config.historyPath ?? config.cachePath.replace(/registry\.json$/, "history.json");
	/** 拉取最新 registry 并覆写本地缓存（与 host 半 sync_registry 相同逻辑）。 */
	async function refresh() {
		const res = await fetch(config.dataUrl);
		if (!res.ok) throw new Error(`下载 registry 失败: ${res.status}`);
		const text = await res.text();
		const doc = JSON.parse(text);
		if (!Array.isArray(doc.plugins)) throw new Error("下载的 registry 结构异常");
		await mkdir(dirname(config.cachePath), { recursive: true });
		await writeFile(config.cachePath, text, "utf8");
		return {
			fetchedAt: doc.meta?.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
			count: doc.plugins.length
		};
	}
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/dsh-recommend/registry.json",
		async handler(_req, res) {
			try {
				const body = await readFile(config.cachePath);
				res.writeHead(200, {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store"
				});
				res.end(body);
			} catch {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
				res.end("registry cache missing — run sync_registry first");
			}
		}
	}), "dsh-recommend: registry route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/dsh-recommend/history.json",
		async handler(_req, res) {
			try {
				const body = await readFile(historyPath);
				res.writeHead(200, {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store"
				});
				res.end(body);
			} catch {
				res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
				res.end("history cache missing — run sync_registry first");
			}
		}
	}), "dsh-recommend: history route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/dsh-recommend/sync",
		async handler(req, res) {
			if (req.method !== "POST") {
				res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
				res.end("method not allowed — use POST");
				return;
			}
			try {
				const result = await refresh();
				res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({
					ok: true,
					...result
				}));
			} catch (err) {
				res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify({
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				}));
			}
		}
	}), "dsh-recommend: sync route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/dsh-recommend/install",
		async handler(req, res) {
			const json = (code, body) => {
				res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
				res.end(JSON.stringify(body));
			};
			try {
				if (req.method !== "POST") return json(405, {
					ok: false,
					error: "method not allowed"
				});
				const origin = req.headers.origin;
				if (origin && origin !== `http://${req.headers.host}`) return json(403, {
					ok: false,
					error: "cross-origin install rejected"
				});
				const chunks = [];
				for await (const chunk of req) chunks.push(chunk);
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
				const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
				if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return json(400, {
					ok: false,
					error: `illegal fullName: ${fullName}`
				});
				let registry;
				try {
					registry = JSON.parse(await readFile(config.cachePath, "utf8"));
				} catch {
					return json(409, {
						ok: false,
						error: "registry cache missing — run sync_registry first"
					});
				}
				const entry = registry.plugins?.find((p) => p.fullName === fullName);
				if (!entry) return json(404, {
					ok: false,
					error: `not in registry: ${fullName}`
				});
				if (entry.excluded) return json(400, {
					ok: false,
					error: `excluded plugin: ${fullName}（${entry.excluded}）`
				});
				const spec = `github:${fullName}`;
				const result = await runInstall(config.installProfile ?? "web", spec);
				json(200, {
					ok: result.exitCode === 0,
					spec,
					profile: config.installProfile ?? "web",
					...result
				});
			} catch (err) {
				json(500, {
					ok: false,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
	}), "dsh-recommend: install route");
}
/** 执行 `dsh plugin --profile <p> add <spec>`，收集输出，超时杀进程。 */
function runInstall(profile, spec) {
	return new Promise((resolve, reject) => {
		const child = spawn("dsh", [
			"plugin",
			"--profile",
			profile,
			"add",
			spec
		], {
			shell: process.platform === "win32",
			windowsHide: true
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d) => {
			stderr += d.toString();
		});
		const timer = setTimeout(() => {
			child.kill();
			resolve({
				exitCode: -1,
				stdout,
				stderr: `${stderr}\n[dsh-recommend] 安装超时（${INSTALL_TIMEOUT_MS / 6e4} 分钟），已终止`,
				timedOut: true
			});
		}, INSTALL_TIMEOUT_MS);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({
				exitCode: code ?? 1,
				stdout,
				stderr,
				timedOut: false
			});
		});
	});
}
//#endregion
export { apply, inject, name };

//# sourceMappingURL=web.mjs.map