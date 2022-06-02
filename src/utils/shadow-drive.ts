import * as anchor from "@project-serum/anchor";
import { StorageAccountResponse } from "@shadow-drive/sdk";
import { Connection } from "@solana/web3.js";
import { IDL } from "./idl";

export type ShdwFileAccount = {
  toBeDeleted: boolean;
  name: string;
  size: number;
  immutable: boolean;
};

const GB_BYTES = 1_073_741_824;
const MB_BYTES = 1_048_576;
const KB_BYTES = 1_024;

export const formatBytes = (bytes: number) => {
  if (bytes < MB_BYTES) {
    return `${(bytes / KB_BYTES).toFixed(2)}GB`;
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

  const accountsCoder = new anchor.BorshAccountsCoder(IDL);
  return files
    .map((file) => {
      if (file) {
        return accountsCoder.decode<ShdwFileAccount>("File", file.data);
      }

      return undefined;
    })
    .filter((account) => account) as ShdwFileAccount[];
};

export const getShadowDriveFileUrl = (accountKey: string, fileName: string) => {
  return `https://shdw-drive.genesysgo.net/${accountKey}/${fileName}`;
};
