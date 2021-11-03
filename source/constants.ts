// Receive/Send annotations will be in relation to main thread

export = {
	GATEWAY_WORKER_CODES: {
		/**
		 * Receive
		 */
		DISCORD: 0 as const,
		/**
		 * Send
		 */
		STATS: 1 as const,
		/**
		 * Send
		 */
		STATUS_UPDATE: 2 as const,
		/**
		 * Send
		 */
		SEND_MESSAGE: 3 as const,
		/**
		 * Receive
		 */
		RESPONSE: 4 as const,
		/**
		 * Receive
		 */
		ERROR_RESPONSE: 5 as const
	}
}
