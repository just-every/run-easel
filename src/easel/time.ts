/** Wall-clock boundary; flow tests replace this module with a controlled clock. */
export async function currentTime(_env: unknown): Promise<string> { return new Date().toISOString() }
