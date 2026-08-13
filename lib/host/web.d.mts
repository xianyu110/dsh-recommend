import { Context } from "@deepseek-ai/cordis";
//#region src/host/web.d.ts
declare const name = "dsh-recommend-web";
declare const inject: string[];
interface Config {
  /** 本地缓存路径（与 host 半一致）。 */
  cachePath: string;
}
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, apply, inject, name };
//# sourceMappingURL=web.d.mts.map