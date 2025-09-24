#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

const [, , bumpArg = 'patch', ...publishArgs] = process.argv

const bump = bumpArg

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function ensureCleanGitStatus() {
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
  if (status.status !== 0) {
    process.exit(status.status ?? 1)
  }
  if (status.stdout.trim().length > 0) {
    console.error('Git worktree is not clean. Commit or stash changes before releasing.')
    process.exit(1)
  }
}

function resolveVersionArgs() {
  const semverRegex = /^\d+\.\d+\.\d+(?:[-+].*)?$/
  if (semverRegex.test(bump)) {
    return [bump]
  }
  const allowed = new Set(['patch', 'minor', 'major', 'prerelease', 'prepatch', 'preminor', 'premajor'])
  if (!allowed.has(bump)) {
    console.error(`Unsupported version argument: ${bump}`)
    console.error('Use a semver (e.g. 0.1.2) or npm version keyword (patch, minor, major, prerelease, etc.).')
    process.exit(1)
  }
  return [bump]
}

function main() {
  if (!existsSync('package.json')) {
    console.error('Run this script from the repository root.')
    process.exit(1)
  }

  ensureCleanGitStatus()

  run('npm', ['run', 'lint'])
  run('npm', ['run', 'type-check'])
  run('npm', ['run', 'test'])
  run('npm', ['run', 'build'])

  const versionArgs = resolveVersionArgs()
  run('npm', ['version', ...versionArgs])

  run('npm', ['publish', '--access', 'public', ...publishArgs])

  run('git', ['push', 'origin', 'HEAD'])
  run('git', ['push', 'origin', '--tags'])

  console.log('Release complete.')
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
