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
		* 排行标签组件（M2）：从 host 半的同源路由加载 registry 并渲染排行榜。
		* 数据路径：GET /dsh-recommend/registry.json（由 dsh-recommend-web 行供给）。
		*
		* 视觉：卡片式榜单列表（注入一段 scoped CSS），描述占整行、文字正常换行，
		* 字号与留白按「正经排行榜页」的体量设计（比紧凑表格大一号）。
		*/
		const SIGNAL_LABELS = {
			maintenance: "维护性",
			popularity: "热度",
			quality: "质量",
			ecosystem: "生态"
		};
		const SIGNAL_ORDER = [
			"maintenance",
			"popularity",
			"quality",
			"ecosystem"
		];
		/** 分数分级配色。 */
		function scoreTier(score) {
			if (score >= .85) return "gold";
			if (score >= .65) return "accent";
			if (score >= .5) return "neutral";
			return "dim";
		}
		const CSS = `
.dshr-wrap { display: flex; flex-direction: column; gap: 16px; }
.dshr-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
.dshr-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--dsw-alias-label-primary); }
.dshr-meta { font-size: 12.5px; color: var(--dsw-alias-label-tertiary); }
.dshr-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dshr-controls input[type="search"] {
  flex: 1 1 220px; min-width: 200px;
  padding: 9px 13px; font-size: 14px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; outline: none;
}
.dshr-controls input[type="search"]:focus { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #3964fe); }
.dshr-controls select {
  padding: 9px 12px; font-size: 14px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; outline: none; cursor: pointer;
}
.dshr-list { display: flex; flex-direction: column; gap: 10px; }
.dshr-row {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  transition: border-color .15s ease;
}
.dshr-row:hover { border-color: var(--dsw-alias-border-l3); }
.dshr-row-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dshr-rank {
  flex: 0 0 auto; min-width: 34px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: var(--dsw-alias-label-secondary);
  border-radius: 8px; background: var(--dsw-alias-bg-layer-2);
}
.dshr-rank.gold { color: #f5c518; }
.dshr-rank.accent { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #3964fe); }
.dshr-rank.dim { color: var(--dsw-alias-label-tertiary); }
.dshr-name { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dshr-name a {
  font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary);
  text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dshr-name a:hover { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #3964fe); }
.dshr-cat { font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dshr-right { margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 16px; }
.dshr-stars { font-size: 13.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dshr-score { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.dshr-score .num { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.dshr-score .num.gold { color: #f5c518; }
.dshr-score .num.accent { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #3964fe); }
.dshr-score .num.neutral { color: var(--dsw-alias-label-secondary); }
.dshr-score .num.dim { color: var(--dsw-alias-label-tertiary); }
.dshr-desc {
  font-size: 13.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.dshr-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dshr-bar { flex: 1 1 160px; height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.dshr-bar > i { display: block; height: 100%; border-radius: 999px; }
.dshr-bar > i.gold { background: #f5c518; }
.dshr-bar > i.accent { background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #3964fe); }
.dshr-bar > i.neutral { background: var(--dsw-alias-label-secondary); }
.dshr-bar > i.dim { background: var(--dsw-alias-label-tertiary); }
.dshr-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.dshr-pill {
  font-size: 12px; line-height: 1; padding: 5px 9px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
}
.dshr-pill b { font-weight: 600; color: var(--dsw-alias-label-primary); }
.dshr-note { font-size: 12.5px; color: var(--dsw-alias-label-tertiary); }
`;
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
			(0, react.useEffect)(() => {
				if (document.getElementById("dshr-rankings-css")) return;
				const style = document.createElement("style");
				style.id = "dshr-rankings-css";
				style.textContent = CSS;
				document.head.appendChild(style);
			}, []);
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
			const topScore = rows[0]?.score ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshr-wrap",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshr-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "dshr-title",
							children: "插件排行"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dshr-meta",
							children: [
								"共 ",
								doc.plugins.filter((p) => !p.excluded).length,
								" 个插件 · 数据 ",
								doc.meta.generatedAt ?? "",
								" · 评分模型 v",
								doc.meta.scoringVersion ?? "?"
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshr-controls",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "search",
								placeholder: "搜索名称 / 描述 / 分类…",
								value: query,
								onChange: (e) => setQuery(e.target.value),
								"aria-label": "搜索插件"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: category,
								onChange: (e) => setCategory(e.target.value),
								"aria-label": "分类筛选",
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
								"aria-label": "排序方式",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "score",
										children: "按综合分"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "stars",
										children: "按热度（★）"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "updated",
										children: "按最近更新"
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshr-list",
						children: rows.map((p, i) => {
							const tier = scoreTier(p.score);
							const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dshr-row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshr-row-top",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: `dshr-rank ${tier}`,
												children: medal
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dshr-name",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
													href: p.url,
													target: "_blank",
													rel: "noreferrer",
													title: p.fullName,
													children: p.fullName
												}), p.category ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dshr-cat",
													children: p.category
												}) : null]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dshr-right",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "dshr-stars",
													children: ["★ ", p.stars]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dshr-score",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `num ${tier}`,
														children: p.score.toFixed(3)
													})
												})]
											})
										]
									}),
									p.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dshr-desc",
										children: p.description
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshr-foot",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshr-bar",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
												className: tier,
												style: { width: `${Math.round(p.score / (topScore || 1) * 100)}%` }
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshr-pills",
											children: SIGNAL_ORDER.map((k) => {
												const v = p.signals?.[k];
												return v === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "dshr-pill",
													children: [
														SIGNAL_LABELS[k],
														" ",
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: v.toFixed(2) })
													]
												}, k);
											})
										})]
									})
								]
							}, p.fullName);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "dshr-note",
						children: [
							"显示 ",
							rows.length,
							" 条（截断到前 100）· 综合分 = 0.35 维护性 + 0.30 热度 + 0.20 质量 + 0.15 生态 · 收录 ≠ 安全背书"
						]
					})
				]
			});
		}
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