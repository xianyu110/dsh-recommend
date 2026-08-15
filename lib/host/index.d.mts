import { Context } from "@deepseek-ai/cordis";
//#region src/host/index.d.ts
declare const name = "dsh-recommend";
declare const inject: string[];
interface Config {
  /** 数据仓库 registry.json 的下载地址。 */
  dataUrl: string;
  /** 本地缓存路径；不存在时由 sync_registry 拉取。 */
  cachePath: string;
  /** 可选：历史数据 URL（默认由 dataUrl 推导：registry.json → history.json）。 */
  historyUrl?: string;
  /** 可选：历史数据缓存路径（默认 cachePath 同级 history.json）。 */
  historyPath?: string;
}
declare function apply(ctx: Context, config: Config): void;
/**
 * 同义扩展组：goal 里的词命中某组任一同义词时，整组同义词参与检索。
 * 覆盖 DSH 插件生态的高频语义（中英 + 常见别名）。
 */
declare const SYNONYM_GROUPS: Record<string, string[]>;
//#endregion
export { Config, SYNONYM_GROUPS, apply, inject, name };
//# sourceMappingURL=index.d.mts.map