export const DEFAULT_UPDATE_INTERVAL = 360
export const MAX_UPDATE_INTERVAL = 43200

export function validUpdateInterval(minutes) {
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_UPDATE_INTERVAL
}

export function normalizeUpdateInterval(minutes) {
    return validUpdateInterval(minutes) ? minutes : DEFAULT_UPDATE_INTERVAL
}
