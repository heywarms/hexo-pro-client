// Keep the original blocks while viewing their Markdown. Re-importing even our
// own export can lose formatting because BlockNote's Markdown conversion is lossy.
export function createBlockSnapshot() {
    let snapshot
    return {
        matches: value => snapshot?.value === value,
        remember(value, blocks) {
            snapshot = { value, blocks: structuredClone(blocks) }
        },
        restore(value) {
            return snapshot?.value === value ? structuredClone(snapshot.blocks) : null
        },
    }
}
