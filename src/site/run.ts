import type { RunData } from '../base/run-site'

/** Every string and command on the run site's Run page (run-easel.com/run); the header's and footer's Source link too. */
export const run: RunData = {
 name: 'Easel',
 repository: 'https://github.com/just-every/run-easel',
 clone: 'npx -y @runeditrun/rer dev just-every/run-easel',
 folder: 'run-easel',
 requirements: 'Runs on macOS, Linux or Windows with WSL2. The installer provides Node; rer manages pnpm.',
 licence: 'MIT',
 docs: true,
 hosted: [],
}
