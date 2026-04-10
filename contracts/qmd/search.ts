import { z } from "zod";

export const qmd_expanded_query_schema = z.object({
	type: z.enum(["lex", "vec", "hyde"]),
	query: z.string(),
});
export type QmdExpandedQuery = z.infer<typeof qmd_expanded_query_schema>;

export const qmd_rrf_contribution_schema = z.object({
	listIndex: z.number(),
	source: z.enum(["fts", "vec"]),
	queryType: z.enum(["original", "lex", "vec", "hyde"]),
	query: z.string(),
	rank: z.number(),
	weight: z.number(),
	backendScore: z.number(),
	rrfContribution: z.number(),
});
export type QmdRrfContribution = z.infer<typeof qmd_rrf_contribution_schema>;

export const qmd_search_explain_schema = z.object({
	ftsScores: z.array(z.number()),
	vectorScores: z.array(z.number()),
	rrf: z.object({
		rank: z.number(),
		positionScore: z.number(),
		weight: z.number(),
		baseScore: z.number(),
		topRankBonus: z.number(),
		totalScore: z.number(),
		contributions: z.array(qmd_rrf_contribution_schema),
	}),
	rerankScore: z.number(),
	blendedScore: z.number(),
});
export type QmdSearchExplain = z.infer<typeof qmd_search_explain_schema>;

export const qmd_search_hit_schema = z.object({
	file: z.string(),
	displayPath: z.string(),
	title: z.string(),
	body: z.string(),
	bestChunk: z.string(),
	bestChunkPos: z.number(),
	score: z.number(),
	context: z.string().nullable(),
	docid: z.string(),
	explain: qmd_search_explain_schema.optional(),
});
export type QmdSearchHit = z.infer<typeof qmd_search_hit_schema>;

export const qmd_search_timing_schema = z.object({
	expand_ms: z.number(),
	search_ms: z.number(),
	total_ms: z.number(),
});
export type QmdSearchTiming = z.infer<typeof qmd_search_timing_schema>;

export const qmd_search_result_schema = z.object({
	results: z.array(qmd_search_hit_schema),
	expanded_queries: z.array(qmd_expanded_query_schema),
	timing: qmd_search_timing_schema,
});
export type QmdSearchResult = z.infer<typeof qmd_search_result_schema>;
