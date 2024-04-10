const DEFAULT_DURATION = 6 * 60 * 1000; // 6m

export async function wait(duration = DEFAULT_DURATION): Promise<void> {
    console.log(`Wait for ${duration / 1000}s ...`);
    return new Promise((resolve) => setTimeout(resolve, duration));
}
