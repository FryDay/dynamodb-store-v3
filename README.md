# dynamodb-store-v3

Implementation of a session store using DynamoDB as an extension of the [express-session middleware](https://github.com/expressjs/session) backed by the [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3).

## Installation
```
yarn add express-session dynamodb-store-v3
```
or
```
npm install --save express-session dynamodb-store-v3
```

## Usage

```typescript
import { DynamoDBStoreV3, DynamoDBStoreV3Options } from 'dynamodb-store-v3';
import session from 'express-session';

const options = {
    table: {
        name: "<DYNAMODB TABLE NAME>",
        hashPrefix: "<PREFIX FOR SESSION IDS>",
        hashKey: "<DYNAMODB ID FIELD>",
        dataAttribute: "<DYNAMODB FIELD FOR SESSION>",
        readCapacityUnits: 5,
        writeCapacityUnits: 5,
    },
    dynamoConfig: {
        accessKeyId: "<AWS ACCESS KEY>",
        secretAccessKey: "<AWS SECRET KEY>",
        region: "<AWS REGION>",
        endpoint: "<DYNAMODB ENDPOINT>",
    },
    touchInterval: 30000,
    ttl: 600000,
    keepExpired: false,
};

app.use(session({
    store: new DynamoDBStoreV3(options),
    ...
}));
```
