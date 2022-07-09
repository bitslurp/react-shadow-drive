import {
  ShdwDrive,
  StorageAccountInfo,
  StorageAccountResponse,
} from "@shadow-drive/sdk";
import { PublicKey } from "@solana/web3.js";

const SHDW_DRIVE_ENDPOINT = "https://shadow-storage.genesysgo.net";

export type ShadowFileData = {
  name: string;
  storageAccount: PublicKey;
};

const GB_BYTES = 1_073_741_824;
const MB_BYTES = 1_048_576;
const KB_BYTES = 1_024;
const PRICE_PER_GB = 250_000_000;

export const formatBytes = (bytes: number) => {
  if (bytes < MB_BYTES) {
    return `${(bytes / KB_BYTES).toFixed(2)}KB`;
  } else if (bytes < GB_BYTES) {
    return `${(bytes / MB_BYTES).toFixed(2)}MB`;
  } else {
    return `${(bytes / GB_BYTES).toFixed(2)}GB`;
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
}: StorageAccountResponse): StorageAccountInfo => ({
  storage_account: publicKey,
  reserved_bytes: account.storage,
  current_usage: account.storageAvailable,
  immutable: account.immutable,
  to_be_deleted: account.toBeDeleted,
  delet_request_epoch: account.deleteRequestEpoch,
  owner1: account.owner1,
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

export function toShdwCost(input: string): number {
  let chunk_size = 0;
  let humanReadable = input.toLowerCase();
  let inputNumber = Number(humanReadable.slice(0, humanReadable.length - 2));
  let inputDescriptor = humanReadable.slice(
    humanReadable.length - 2,
    humanReadable.length
  );

  switch (inputDescriptor) {
    case "kb":
      chunk_size = KB_BYTES;
      break;
    case "mb":
      chunk_size = MB_BYTES;
      break;
    case "gb":
      chunk_size = GB_BYTES;
      break;

    default:
      break;
  }

  const bytes = inputNumber * chunk_size;

  return Math.ceil((bytes / GB_BYTES) * PRICE_PER_GB);
}
