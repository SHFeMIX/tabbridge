export function formatTimeRemaining(targetMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, targetMs - nowMs)
  const totalSeconds = Math.floor(diff / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 秒`
  }
  return `${seconds} 秒`
}
