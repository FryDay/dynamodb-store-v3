/**
 * Logs messages when debug is enabled.
 * @param  {string} message Message to be debugged.
 * @param  {any}    object  Optional param that will be stringified.
 */
export function debug(message: string, object?: any): void {
  if (process.env.DYNAMODB_DEBUG) {
    const argument = object || '';

    console.log(
      `${new Date().toString()} - DYNAMODB_STORE: ${message}`,
      typeof argument === 'object' ? JSON.stringify(argument) : argument,
    );
  }
}

/**
 * Transforms a date to seconds since epoch.
 * @param  {Date} date The date to be converted.
 * @return {number}    Representation of the date in seconds since epoch.
 */
export function toSecondsEpoch(date: Date): number {
  if (!(date instanceof Date)) {
    throw new Error(`${date} is not a Date!`);
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Checks if an expiration date has passed.
 * @param {number} expires Expiration in seconds since epoch.
 * @return {boolean} Is the date is expired?
 */
export function isExpired(expires: number): boolean {
  return !expires || expires <= toSecondsEpoch(new Date());
}
