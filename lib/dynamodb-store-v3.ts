import {
  DEFAULT_TABLE_NAME,
  DEFAULT_RCU,
  DEFAULT_WCU,
  DEFAULT_CALLBACK,
  DEFAULT_HASH_KEY,
  DEFAULT_HASH_PREFIX,
  DEFAULT_DATA_ATTRIBUTE,
  DEFAULT_TTL,
  DEFAULT_TOUCH_INTERVAL,
  DEFAULT_KEEP_EXPIRED_POLICY,
} from './constants';
import { debug, isExpired, toSecondsEpoch } from './utlis';
import { Store, SessionData } from 'express-session';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
declare module 'express-session' {
  interface SessionData {
    updated: number;
  }
}

export class DynamoDBStoreV3 extends Store {
  private options: DynamoDBStoreV3Options;
  private dynamoDBClient: DynamoDBDocumentClient;

  constructor(
    options: DynamoDBStoreV3Options,
    callback: (err?: Error) => void = DEFAULT_CALLBACK,
  ) {
    super();
    debug('Initializing store', options);

    this.options = {
      table: {
        name: options.table.name ? options.table.name : DEFAULT_TABLE_NAME,
        hashPrefix: options.table.hashPrefix
          ? options.table.hashPrefix
          : DEFAULT_HASH_PREFIX,
        hashKey: options.table.hashKey
          ? options.table.hashKey
          : DEFAULT_HASH_KEY,
        dataAttribute: options.table.dataAttribute
          ? options.table.dataAttribute
          : DEFAULT_DATA_ATTRIBUTE,
        readCapacityUnits: options.table.readCapacityUnits
          ? options.table.readCapacityUnits
          : DEFAULT_RCU,
        writeCapacityUnits: options.table.writeCapacityUnits
          ? options.table.writeCapacityUnits
          : DEFAULT_WCU,
      },
      dynamoConfig: {
        accessKeyId: options.dynamoConfig.accessKeyId,
        secretAccessKey: options.dynamoConfig.secretAccessKey,
        region: options.dynamoConfig.region,
        endpoint: options.dynamoConfig.endpoint,
      },
      touchInterval: options.touchInterval
        ? options.touchInterval
        : DEFAULT_TOUCH_INTERVAL,
      ttl: options.ttl ? options.ttl : DEFAULT_TTL,
      keepExpired: options.keepExpired
        ? options.keepExpired
        : DEFAULT_KEEP_EXPIRED_POLICY,
    };

    const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
      wrapNumbers: false,
    };
    const client = new DynamoDBClient(this.options.dynamoConfig);
    this.dynamoDBClient = DynamoDBDocumentClient.from(client, {
      marshallOptions,
      unmarshallOptions,
    });

    this.createTable(callback);
  }

  /**
   * Creates the dynamodb table. Does nothing if table already exists.
   * @param  {Function} callback Callback to be invoked at the end of the execution.
   */
  async createTable(callback: (err?: Error) => void): Promise<void> {
    try {
      const exists = await this.tableExists();

      if (!exists) {
        debug(`Creating table ${this.options.table.name}...`);
        const command = new CreateTableCommand({
          TableName: this.options.table.name,
          KeySchema: [
            { AttributeName: this.options.table.hashKey, KeyType: 'HASH' },
          ],
          AttributeDefinitions: [
            { AttributeName: this.options.table.hashKey, AttributeType: 'S' },
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: this.options.table.readCapacityUnits,
            WriteCapacityUnits: this.options.table.writeCapacityUnits,
          },
        });
        this.dynamoDBClient.send(command);
      }

      callback();
    } catch (e) {
      debug(`Error creating table ${this.options.table.name}`, e);
      callback(e);
    }
  }

  /**
   * Stores a session in dynamodb.
   * @param  {String}      sid      Session ID.
   * @param  {SessionData} sess     The session object.
   * @param  {Function}    callback Callback to be invoked at the end of the execution.
   */
  set(sid: string, sess: SessionData, callback: (err?: any) => void): void {
    try {
      const sessionID = this.getSessionID(sid);
      const expires = toSecondsEpoch(this.getExpiration(sess));

      sess.updated = toSecondsEpoch(new Date());
      const command = new UpdateCommand({
        TableName: this.options.table.name,
        UpdateExpression: `SET #field0 = :value0, expires = :e`,
        ExpressionAttributeNames: {
          '#field0': this.options.table.dataAttribute,
        },
        ExpressionAttributeValues: { ':value0': sess, ':e': expires },
        Key: {
          [this.options.table.hashKey]: sessionID,
        },
        ReturnValues: 'ALL_NEW',
      });

      debug(`Saving session '${sid}'`, sess);
      this.dynamoDBClient.send(command).finally(callback);
    } catch (e) {
      debug('Error saving session', {
        sid,
        sess,
        e,
      });
      if (typeof callback === 'function') {
        callback(e);
      }
    }
  }

  /**
   * Retrieves a session from dynamodb.
   * @param  {string}   sid      Session ID.
   * @param  {Function} callback Callback to be invoked at the end of the execution.
   */
  async get(
    sid: string,
    callback: (err: any, session?: SessionData | null) => void,
  ): Promise<void> {
    try {
      const sessionID = this.getSessionID(sid);
      const command = new GetCommand({
        TableName: this.options.table.name,
        Key: {
          [this.options.table.hashKey]: sessionID,
        },
        ConsistentRead: true,
      });
      const { Item: record } = await this.dynamoDBClient.send(command);

      if (!record) {
        debug(`Session '${sid}' not found`);
        callback(null, null);
      } else if (isExpired(record.expires)) {
        this.handleExpiredSession(sid, callback);
      } else {
        debug(
          `Session '${sid}' found`,
          record[this.options.table.dataAttribute],
        );
        callback(null, record[this.options.table.dataAttribute]);
      }
    } catch (e) {
      debug(`Error getting session '${sid}'`, e);
      callback(e);
    }
  }

  /**
   * Deletes a session from dynamodb.
   * @param  {string}   sid      Session ID.
   * @param  {Function} callback Callback to be invoked at the end of the execution.
   */
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      const sessionID = this.getSessionID(sid);
      const command = new DeleteCommand({
        TableName: this.options.table.name,
        Key: {
          [this.options.table.hashKey]: sessionID,
        },
      });

      await this.dynamoDBClient.send(command);
      debug(`Destroyed session '${sid}'`);
      if (typeof callback === 'function') {
        callback(null);
      }
    } catch (e) {
      debug(`Error destroying session '${sid}'`, e);
      if (typeof callback === 'function') {
        callback(e);
      }
    }
  }

  /**
   * Updates the expiration time of an existing session.
   * @param  {string}      sid      Session ID.
   * @param  {SessionData} sess     The session object.
   * @param  {Function}    callback Callback to be invoked at the end of the execution.
   */
  touch(sid: string, sess: SessionData, callback?: () => void): void {
    try {
      if (
        !sess.updated ||
        sess.updated + this.options.touchInterval <= Date.now()
      ) {
        const sessionID = this.getSessionID(sid);
        const expires = this.getExpiration(sess);
        const command = new UpdateCommand({
          TableName: this.options.table.name,
          UpdateExpression: `set expires = :e, ${this.options.table.dataAttribute}.#up = :n`,
          ExpressionAttributeNames: {
            '#up': 'updated',
          },
          ExpressionAttributeValues: {
            ':e': toSecondsEpoch(expires),
            ':n': Date.now(),
          },
          Key: {
            [this.options.table.hashKey]: sessionID,
          },
          ReturnValues: 'UPDATED_NEW',
        });

        debug(`Touching session '${sid}'`);
        this.dynamoDBClient.send(command).finally(callback);
      } else {
        debug(`Skipping touch of session '${sid}'`);
        if (typeof callback === 'function') {
          callback();
        }
      }
    } catch (e) {
      debug(`Error touching session '${sid}'`, e);
      if (typeof callback === 'function') {
        callback();
      }
    }
  }

  /**
   * Gets the session ID.
   * @param  {string} sid Original session id.
   * @return {string}     Prefix + original session id.
   */
  private getSessionID(sid: string): string {
    return `${this.options.table.hashPrefix}${sid}`;
  }

  /**
   * Calculates the session expiration date.
   * @param  {Session} sess The session object.
   * @return {Date}         The session expiration date.
   */
  private getExpiration(sess: SessionData): Date {
    let expirationDate = Date.now();
    if (this.options.ttl !== undefined) {
      expirationDate += this.options.ttl;
    } else if (sess.cookie && typeof sess.cookie.maxAge === 'number') {
      expirationDate += sess.cookie.maxAge;
    } else {
      expirationDate += DEFAULT_TTL;
    }
    return new Date(expirationDate);
  }

  /**
   * Handle expired sessions.
   */
  private async handleExpiredSession(
    sid: string,
    callback?: (err?: any) => void,
  ) {
    debug(`Found session '${sid}' but it is expired`);
    if (this.options.keepExpired) {
      if (typeof callback === 'function') {
        callback();
      }
    } else {
      this.destroy(sid, callback);
    }
  }

  /**
   * Checks if the dynamodb table already exists.
   */
  private async tableExists(): Promise<boolean> {
    const command = new DescribeTableCommand({
      TableName: this.options.table.name,
    });
    try {
      await this.dynamoDBClient.send(command);
      return true;
    } catch (e) {
      return false;
    }
  }
}

export interface DynamoDBStoreV3Options {
  table: {
    name: string;
    hashPrefix: string;
    hashKey: string;
    dataAttribute: string;
    readCapacityUnits: number;
    writeCapacityUnits: number;
  };
  dynamoConfig: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint: string;
  };
  touchInterval: number;
  ttl: number;
  keepExpired: boolean;
}
