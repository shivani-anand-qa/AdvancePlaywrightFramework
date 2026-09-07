export function hasApiKey(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}
