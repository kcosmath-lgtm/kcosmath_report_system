export async function optionalImageResource<T>(task: Promise<T>, timeoutMs = 5000): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
