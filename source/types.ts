export type UnpackArray<T> = T extends Array<infer R> ? R : never
export type UnpackRecord<T> = T extends Record<string, infer R> ? R : never
export type InferMapK<T> = T extends Map<infer K, unknown> ? K : never
export type InferMapV<T> = T extends Map<string, infer V> ? V : never
export type Merge<A, B> = ({ [K in keyof A]: K extends keyof B ? B[K] : A[K] } & B) extends infer O ? { [K in keyof O]: O[K] } : never

export type InferModelDef<M extends import("./client/utils/orm").Model<unknown>> = M extends import("./client/utils/orm").Model<infer D> ? D : unknown

export type LavalinkInfo = {
	identifier: string
	isSeekable: boolean
	author: string
	length: number
	isStream: boolean
	position: number
	title: string
	uri: string
}

export type PartialTrack = {
	title: string
	class: string
	id: string
	length: number
	thumbnail: { src: string; width: number; height: number }
	live: boolean
}

export type WebQueue = {
	members: Array<{ id: string; tag: string; avatar: string | null; isAmanda: boolean }>
	tracks: Array<PartialTrack>
	playing: boolean
	voiceChannel: { name: string; id: string }
	pausedAt: number | null
	trackStartTime: number
	attributes: {
		loop: boolean
	}
}
