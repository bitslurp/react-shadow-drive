import * as anchor from "@project-serum/anchor";
import {
  ShdwDrive,
  StorageAccountInfo,
  StorageAccountResponse,
} from "@shadow-drive/sdk";
import { PublicKey } from "@solana/web3.js";

const SHDW_DRIVE_ENDPOINT = "https://shadow-storage.genesysgo.net";

export type ShadowStorageConfig = {
  shadesPerGib: anchor.BN;
  storageAvailable: anchor.BN;
  admin2: PublicKey;
  tokenAccount: PublicKey;
  uploader: PublicKey;
  mutableFeeStartEpoch: anchor.BN;
  shadesPerGibPerEpoch: anchor.BN;
  crankBps: number;
  maxAccountSize: anchor.BN;
  minAccountSize: anchor.BN;
};

export type ShadowFileData = {
  name: string;
  storageAccount: PublicKey;
};

const GIB_BYTES = 1_073_741_824;
const MB_BYTES = 1_048_576;
const KB_BYTES = 1_024;

export const formatBytes = (bytes: number) => {
  if (bytes < MB_BYTES) {
    return `${(bytes / KB_BYTES).toFixed(2)}KB`;
  } else if (bytes < GIB_BYTES) {
    return `${(bytes / MB_BYTES).toFixed(2)}MB`;
  } else {
    return `${(bytes / GIB_BYTES).toFixed(2)}GB`;
  }
};

/**
 * Fetch the file keys (names) for a storage account
 * @param accountId Storge account id
 */
export const getStorageAccountKeys = (accountId: string) => {
  return fetch("https://shadow-storage.genesysgo.net/list-objects", {
    body: JSON.stringify({
      storageAccount: accountId,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
    mode: "cors",
  }).then((r) => r.json());
};

export const getFileData = (url: string) => {
  return fetch(`${SHDW_DRIVE_ENDPOINT}/get-object-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      location: url,
    }),
  });
};

export const getFiles = async (
  storageAccount: PublicKey,
  drive: ShdwDrive
): Promise<ShadowFileData[]> => {
  const files = await drive.listObjects(storageAccount);

  const { keys } = files;

  return keys.map((key) => ({
    name: key,
    storageAccount,
  }));
};

export const getShadowDriveFileUrl = ({
  storageAccount,
  name,
}: {
  name: string;
  storageAccount: PublicKey;
}) => {
  return `https://shdw-drive.genesysgo.net/${storageAccount.toString()}/${name}`;
};

export const accountResponseToInfo = ({
  publicKey,
  account,
  version
}: StorageAccountResponse): StorageAccountInfo => ({
  storage_account: publicKey,
  reserved_bytes: account.storage,
  current_usage: account.storageAvailable,
  immutable: account.immutable,
  to_be_deleted: account.toBeDeleted,
  delete_request_epoch: account.deleteRequestEpoch,
  owner1: account.owner1,
  version: version,
  account_counter_seed: account.accountCounterSeed,
  creation_time: account.creationTime,
  creation_epoch: account.creationEpoch,
  last_fee_epoch: account.lastFeeEpoch,
  identifier: account.identifier,
});

// TODO: Add retry number to account for successive request failure
export async function pollRequest<T>(
  params: {
    request: () => Promise<T>;
    shouldStop: (response: T) => boolean;
    onStop?: (response: T) => void;
    onFailure?: () => void;
    maxFailures?: number;
    timeout?: number;
  },
  failureCount: number = 0
) {
  const {
    request,
    shouldStop,
    onStop,
    onFailure,
    maxFailures = 5,
    timeout = 1000,
  } = params;

  if (maxFailures && maxFailures === failureCount) {
    onFailure?.();
  } else {
    try {
      const response = await request();

      const stop = shouldStop(response);

      if (stop) {
        onStop?.(response);
      } else {
        setTimeout(() => pollRequest(params), timeout);
      }
    } catch (e) {
      console.error(e);
      setTimeout(() => pollRequest(params, failureCount + 1), timeout);
    }
  }
}

const bytesPerUnit: Record<string, number> = {
  kb: KB_BYTES,
  mb: MB_BYTES,
  gb: GIB_BYTES,
};

export function toShdwCost(shadesPerGib: number, input: string): number {
  const humanReadable = input.toLowerCase();
  const inputNumber = Number(humanReadable.slice(0, humanReadable.length - 2));
  const inputDescriptor = humanReadable.slice(
    humanReadable.length - 2,
    humanReadable.length
  );
  const chunk_size = bytesPerUnit[inputDescriptor] || 0;
  const bytes = inputNumber * chunk_size;

  return Math.ceil((bytes / GIB_BYTES) * shadesPerGib);
}
