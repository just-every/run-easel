let playwright;
export function initialize(data) { playwright = data.playwright; }
export function resolve(specifier, context, nextResolve) {
 return nextResolve(specifier === '@playwright/test' ? playwright : specifier, context);
}
