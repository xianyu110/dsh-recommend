import { Context } from "@deepseek-ai/cordis";
//#region src/host/web.d.ts
declare const name = "dsh-recommend-web";
declare const inject: string[];
interface Config {
  /** 本地缓存路径（与 host 半一致）。 */
  cachePath: string;
  /** 数据仓库 registry.json 下载地址（POST /sync 拉取用，与 host 半一致）。 */
  dataUrl: string;
  /** 可选：历史数据缓存路径（默认 cachePath 同级 history.json）。 */
  historyPath?: string;
  /** 可选：安装目标 profile 名；缺省为 web（浏览器半所在的 profile）。 */
  installProfile?: string;
}
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { Config, apply, inject, name };
//# sourceMappingURL=web.d.mts.map