import MySQL = require("MySQL2/promise");

export interface FilteredGuild {
	id: string;
	name: string;
	icon: string;
	nameAcronym: string;
}

export interface SQLWrapper {
	all(string: string): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<Array<MySQL.RowDataPacket>>;

	get(string: string): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<MySQL.RowDataPacket>;
}
