/**
 * Format a response's status word as 4 hex digits (e.g., "6A82", "6700")
 */
export function formatSw(response: { sw1: number; sw2: number }): string {
    return [response.sw1, response.sw2]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}
