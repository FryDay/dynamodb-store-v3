export const DEFAULT_TABLE_NAME = 'sessions';
export const DEFAULT_HASH_KEY = 'id';
export const DEFAULT_HASH_PREFIX = 'sess_';
export const DEFAULT_DATA_ATTRIBUTE = 'sess';
export const DEFAULT_RCU = 5;
export const DEFAULT_WCU = 5;
export const DEFAULT_TTL = 86400000; // 1 day
export const DEFAULT_TOUCH_INTERVAL = 30000; // 30 seconds
export const DEFAULT_KEEP_EXPIRED_POLICY = false;
export const DEFAULT_CALLBACK = (err?: Error) => {
  if (err) {
    throw err;
  }
};
