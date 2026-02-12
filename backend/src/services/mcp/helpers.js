/**
 * MCP Helper Utilities
 * Date conversion and result formatting for MCP tool responses
 */

/**
 * Convert YYYY-MM-DD to YYYYMMDD (DB/Tally format)
 */
export function userDateToTally(dateStr) {
  if (!dateStr) return null;
  if (/^\d{8}$/.test(dateStr)) return dateStr;
  return dateStr.replace(/-/g, '');
}

/**
 * Convert YYYYMMDD to YYYY-MM-DD (display format)
 */
export function tallyDateToUser(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * Get today's date as YYYYMMDD
 */
export function todayTally() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function todayUser() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Truncate large array results with pagination metadata
 */
export function truncateResults(results, maxItems = 100) {
  if (!Array.isArray(results)) return results;
  if (results.length <= maxItems) {
    return { data: results, total: results.length, truncated: false };
  }
  return {
    data: results.slice(0, maxItems),
    total: results.length,
    showing: maxItems,
    truncated: true,
    message: `Showing ${maxItems} of ${results.length} results. Use limit/offset for pagination.`
  };
}

/**
 * Format MCP text response
 */
export function textResponse(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }]
  };
}

/**
 * Format MCP error response
 */
export function errorResponse(error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message || error}` }],
    isError: true
  };
}
