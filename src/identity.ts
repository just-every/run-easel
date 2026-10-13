import type { EditionIdentity } from './base/identity'
import branding from './branding.json'

export const identity: EditionIdentity = {
 product: 'Easel', deployment: branding.name,
 purpose: '{deployment}’s budgets, forecasts and monthly review, in one private workspace.',
 tagline: 'Budgets, forecasts and the monthly review for one company: reconciled actuals, traceable drivers, department submissions, approved budgets kept exactly as approved, and scenarios you can compare.',
 signInPath: '/signin', runSite: 'https://run-easel.com', installedHome: 'lobby',
 theme: '/rer-theme.css', fonts: '/fonts/fonts.css', mark: '/brand/mark.svg', band: '/brand/band.svg', accentColor: branding.primaryColor,
}
