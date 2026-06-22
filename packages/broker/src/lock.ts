import lockfile from 'proper-lockfile'

export async function acquireBrokerLock(lockPath: string): Promise<() => Promise<void>> {
  return await lockfile.lock(lockPath, {
    stale: 5000,
    update: 2000,
    retries: 0,
  })
}
