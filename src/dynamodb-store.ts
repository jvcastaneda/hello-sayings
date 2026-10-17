import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  paginateScan,
} from "@aws-sdk/lib-dynamodb";
import type { Saying, SayingsStore } from "./store.js";

export interface DynamoDBStoreOptions {
  table: string;
  // Override for DynamoDB Local; leave unset for AWS
  endpoint?: string;
}

// Table schema: partition key `id` (S); attribute `text` (S).
// Credentials and region come from the SDK's default provider chain
// (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION env vars, or IAM roles on AWS)
export class DynamoDBStore implements SayingsStore {
  private readonly db: DynamoDBDocumentClient;
  private readonly table: string;

  constructor({ table, endpoint }: DynamoDBStoreOptions) {
    this.table = table;
    this.db = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        endpoint,
        maxAttempts: 3,
        // Fail fast instead of hanging requests when DynamoDB is unreachable
        requestHandler: { connectionTimeout: 1000, requestTimeout: 3000 },
      }),
    );
  }

  async list(): Promise<Saying[]> {
    const sayings: Saying[] = [];
    for await (const page of paginateScan({ client: this.db }, { TableName: this.table })) {
      for (const item of page.Items ?? []) sayings.push({ id: item.id, text: item.text });
    }
    return sayings.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  async get(id: string): Promise<Saying | undefined> {
    const { Item } = await this.db.send(new GetCommand({ TableName: this.table, Key: { id } }));
    return Item && { id: Item.id, text: Item.text };
  }

  async put(id: string, text: string): Promise<boolean> {
    const { Attributes } = await this.db.send(
      new PutCommand({ TableName: this.table, Item: { id, text }, ReturnValues: "ALL_OLD" }),
    );
    return Attributes === undefined;
  }

  async delete(id: string): Promise<boolean> {
    const { Attributes } = await this.db.send(
      new DeleteCommand({ TableName: this.table, Key: { id }, ReturnValues: "ALL_OLD" }),
    );
    return Attributes !== undefined;
  }

  // A key that never exists: cheap, and only needs the GetItem permission
  async ping(): Promise<void> {
    await this.db.send(
      new GetCommand({ TableName: this.table, Key: { id: "__ping__" }, ProjectionExpression: "id" }),
    );
  }

  destroy() {
    this.db.destroy();
  }
}
