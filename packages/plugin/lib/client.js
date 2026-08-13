window.__ModuleLoader__.load({
	id: "dsh-recommend",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/RankingsTab.tsx
		/**
		* 排行标签组件（M2）：从 host 半的同源路由加载 registry 并渲染榜单。
		* 数据路径：GET /dsh-recommend/registry.json（由 dsh-recommend-web 行供给）。
		*/
		const SIGNAL_LABELS = {
			maintenance: "维护性",
			popularity: "热度",
			quality: "质量",
			ecosystem: "生态"
		};
		function RankingsTab({ loadRankings }) {
			const [doc, setDoc] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [category, setCategory] = (0, react.useState)("");
			const [view, setView] = (0, react.useState)("score");
			(0, react.useEffect)(() => {
				let alive = true;
				loadRankings().then((d) => {
					if (alive) setDoc(d);
				}).catch((err) => {
					if (alive) setError(err instanceof Error ? err.message : String(err));
				});
				return () => {
					alive = false;
				};
			}, [loadRankings]);
			const categories = (0, react.useMemo)(() => {
				const set = /* @__PURE__ */ new Set();
				for (const p of doc?.plugins ?? []) if (p.category) set.add(p.category);
				return [...set].sort();
			}, [doc]);
			const rows = (0, react.useMemo)(() => {
				if (!doc) return [];
				const q = query.toLowerCase();
				const list = doc.plugins.filter((p) => !p.excluded).filter((p) => !category || p.category === category).filter((p) => `${p.fullName} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q));
				list.sort((a, b) => {
					if (view === "stars") return b.stars - a.stars;
					if (view === "updated") return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
					return b.score - a.score;
				});
				return list.slice(0, 100);
			}, [
				doc,
				query,
				category,
				view
			]);
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				role: "alert",
				children: [
					"榜单数据加载失败：",
					error,
					"（先调用 sync_registry 工具，或确认 web 行已挂载）"
				]
			});
			if (!doc) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: "正在加载插件榜单…"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: 8,
						flexWrap: "wrap",
						marginBottom: 8
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							placeholder: "搜索名称/描述/分类…",
							value: query,
							onChange: (e) => setQuery(e.target.value),
							"aria-label": "搜索"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: category,
							onChange: (e) => setCategory(e.target.value),
							"aria-label": "分类",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: "全部分类"
							}), categories.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: c,
								children: c
							}, c))]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: view,
							onChange: (e) => setView(e.target.value),
							"aria-label": "排序",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "score",
									children: "综合分"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "stars",
									children: "热门（★）"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "updated",
									children: "最近更新"
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					style: {
						width: "100%",
						borderCollapse: "collapse",
						fontSize: 13
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "#"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "插件"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "描述"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "★"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "分数"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							style: thStyle,
							children: "信号"
						})
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: tdStyle,
							children: p.score > .8 ? "🥇" : p.score > .6 ? "🥈" : p.score > .4 ? "🥉" : ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: tdStyle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: p.url,
								target: "_blank",
								rel: "noreferrer",
								children: p.fullName
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: {
								...tdStyle,
								color: "var(--dsw-alias-label-secondary)"
							},
							children: p.description ?? ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: tdStyle,
							children: p.stars
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: tdStyle,
							children: p.score.toFixed(3)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							style: tdStyle,
							children: Object.entries(p.signals ?? {}).map(([k, v]) => `${SIGNAL_LABELS[k] ?? k} ${v.toFixed(2)}`).join(" · ")
						})
					] }, p.fullName)) })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: {
						color: "var(--dsw-alias-label-tertiary)",
						fontSize: 12
					},
					children: [
						rows.length,
						" 条 · 数据 ",
						doc.meta.generatedAt ?? "",
						" · 评分模型 v",
						doc.meta.scoringVersion ?? "?"
					]
				})
			] });
		}
		const thStyle = {
			textAlign: "left",
			padding: "4px 8px",
			borderBottom: "1px solid var(--dsw-alias-border-1)"
		};
		const tdStyle = {
			padding: "4px 8px",
			borderBottom: "1px solid var(--dsw-alias-border-1)",
			verticalAlign: "top"
		};
		//#endregion
		//#region src/client/locales.ts
		/** dsh-recommend 排行标签的本地化文案。 */
		const zh = { tab: "插件排行" };
		const en = { tab: "Plugin rankings" };
		//#endregion
		//#region src/client/index.ts
		/** 本插件拥有的字典命名空间。 */
		const NS = "dshRecommend";
		/** 设置页注册所需的客户端服务。 */
		const inject = ["slots", "locale"];
		/** 向「插件」设置分区贡献「插件排行」标签。 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-recommend: dictionaries");
			const t = ctx.locale.bind(NS);
			const injected = () => ({ loadRankings: async () => {
				const res = await fetch("/dsh-recommend/registry.json", { cache: "no-store" });
				if (!res.ok) throw new Error(`registry 路由 ${res.status}（先调用 sync_registry）`);
				return res.json();
			} });
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "rankings",
				order: 20,
				label: () => t("tab"),
				locale: NS,
				inject: injected
			}, RankingsTab));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map