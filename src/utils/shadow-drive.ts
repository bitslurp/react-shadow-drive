import * as anchor from "@project-serum/anchor";
import { StorageAccountResponse } from "@shadow-drive/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { IDL } from "./idl";

export type ShdwFileAccount = {
  toBeDeleted: boolean;
  name: string;
  size: number;
  immutable: boolean;
  storageAccount: PublicKey;
};

export type ShadowFileData = {
  key: PublicKey;
  account: ShdwFileAccount;
};

const GB_BYTES = 1_073_741_824;
const MB_BYTES = 1_048_576;
const KB_BYTES = 1_024;
const accountsCoder = new anchor.BorshAccountsCoder(IDL);

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

export const getFileAccounts = async (
  storageAccount: StorageAccountResponse,
  connection: Connection
) => {
  let fileAccounts: Array<Promise<[anchor.web3.PublicKey, number]>> = [];
  const fileCounter = new anchor.BN(
    storageAccount.account.initCounter
  ).toNumber();

  for (let counter = 0; counter < fileCounter; counter++) {
    let fileSeed = new anchor.BN(counter)
      .toTwos(64)
      .toArrayLike(Buffer, "le", 4);

    fileAccounts = fileAccounts.concat(
      anchor.web3.PublicKey.findProgramAddress(
        [storageAccount.publicKey.toBytes(), fileSeed],
        new anchor.web3.PublicKey(
          "2e1wdyNhUvE76y6yUCvah2KaviavMJYKoRun8acMRBZZ"
        )
      )
    );
  }

  const accounts = await Promise.all(fileAccounts);

  const files = await connection.getMultipleAccountsInfo(
    accounts.map((a) => a[0])
  );

  return files
    .map((file, i) => {
      if (file) {
        return {
          account: accountsCoder.decode<ShdwFileAccount>("File", file.data),
          key: accounts[i][0],
        };
      }

      return {};
    })
    .filter((account) => account.account) as ShadowFileData[];
};

export const getFileAccount = async (
  fileKey: PublicKey,
  connection: Connection
) => {
  const fileAccountInfo = await connection.getAccountInfo(fileKey);

  return accountsCoder.decode<ShdwFileAccount>("File", fileAccountInfo.data);
};

export const getShadowDriveFileUrl = ({
  storageAccount,
  name,
}: ShdwFileAccount) => {
  return `https://shdw-drive.genesysgo.net/${storageAccount.toString()}/${name}`;
};

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
    } catch {
      setTimeout(() => pollRequest(params, failureCount + 1), timeout);
    }
  }
}
