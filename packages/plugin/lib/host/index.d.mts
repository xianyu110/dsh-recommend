import { Context } from "@deepseek-ai/cordis";
//#region src/host/index.d.ts
declare const name = "dsh-recommend";
declare const inject: string[];
interface Config {
  /** 数据仓库 registry.json 的下载地址。 */
  dataUrl: string;
  /** 本地缓存路径；不存在时由 sync_registry 拉取。 */
  cachePath: string;
}
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, apply, inject, name };
//# sourceMappingURL=index.d.mts.map