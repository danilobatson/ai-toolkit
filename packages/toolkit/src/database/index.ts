// Database — provider-agnostic Postgres powered by Drizzle ORM
export { createDatabase, detectProvider } from "./database.js";
export { migrate } from "./migrate.js";
export type {
	DatabaseClient,
	DatabaseConfig,
	DatabaseDriver,
	DatabaseProvider,
	DistanceMetric,
	MigrateOptions,
	MigrateResult,
	VectorSearchOptions,
	VectorSearchResult,
} from "./types.js";
export type { VectorSearchTableOptions } from "./vector.js";
export {
	getVectorColumn,
	vectorSearch,
	vectorSearchRaw,
} from "./vector.js";
