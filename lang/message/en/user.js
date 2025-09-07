export const USER_MESSAGES = {
    RANGE: "Please enter the number between {min} and {max}.",
    WRONG: "Wrong order!",
    EXCELLENT: "Excellent memory!"
};

export function t(key, args = {}) {
    let s = USER_MESSAGES[key] ?? "";
    return s.replace(/\{(\w+)\}/g, (_, k) => (args[k] ?? ""));
}