export type UnpackArray<T> = T extends Array<infer R> ? R : never
export type UnpackRecord<T> = T extends Record<string, infer R> ? R : never
export type InferMap<T> = T extends Map<infer K, infer V> ? { key: K, value: V } : never

export type CommandManagerParams = [
	import("@amanda/commands").ChatInputCommand,
	import("@amanda/lang").Lang,
	number
]
