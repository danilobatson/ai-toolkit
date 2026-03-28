/**
 * @deprecated Use `@jamaalbuilds/ai-toolkit/monitor` instead.
 * This module is preserved for backward compatibility only.
 */

export type {
	Logger,
	MonitorConfig as LangfuseConfig,
} from "../monitor/index.js";
export {
	createLogger,
	createMonitor as initLangfuse,
} from "../monitor/index.js";
