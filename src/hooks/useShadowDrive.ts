import {
  ShadowBatchUploadResponse,
  ShdwDrive,
  StorageAccount,
  StorageAccountResponse,
} from "@shadow-drive/sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import {
  getFileAccount,
  getFileAccounts,
  getShadowDriveFileUrl,
  pollRequest,
  ShadowFileData,
  ShdwFileAccount,
} from "../utils/shadow-drive";

export type StorageAccountInfo = {
  accountName: string;
  storageSpace: string;
  storageUnit: string;
};

export type StorageAccountAction =
  | "creating"
  | "deleting"
  | "polling"
  | "makingImmutable"
  | "cancellingDeletion";

export type FileAccountAction =
  | "deleting"
  | "polling"
  | "uploading"
  | "replacing"
  | "cancellingDeletion";

type FileActions = Record<string, FileAccountAction>;
type StorageActions = Record<string, StorageAccountAction>;
export type FilesRecord = Record<string, ShadowFileData[]>;

export type UseShadowDriveOptions = {
  /**
   * Polling interval in MS,
   * will be used to poll for account/file updates following marking for deletion, immutability etc
   */
  pollingInterval?: number;
  /**
   * Called when a file request action is successful
   */
  onFileRequestSuccess?: (
    action: FileAccountAction,
    descriptor: string,
    file?: ShadowFileData
  ) => void;
  /**
   * Called when a file request action fails
   */
  onFileRequestError?: (
    action: FileAccountAction,
    descriptor: string,
    file?: ShadowFileData
  ) => void;
  /**
   * Called after file address copied to clipboard
   */
  onCopiedToClipboard?: () => void;
  /**
   * Invoked after request to refresh account data fails
   */
  onStorageAccountRefreshError?: (account: StorageAccountResponse) => void;
  /**
   * Called when a storage account request is successful
   */
  onStorageRequestSuccess?: (
    action: StorageAccountAction,
    descriptor: string,
    account?: StorageAccountResponse
  ) => void;
  /**
   * Called when a storage account request fails
   */
  onStorageRequestError?: (
    action: StorageAccountAction,
    descriptor: string,
    account?: StorageAccountResponse
  ) => void;
};

export type UseShadowDriveReturnValue = {
  /**
   * Whether general requests are in progress, such as the request for storage accounts
   */
  loading: boolean;
  /**
   * Array of storage accounts belonging to active wallet
   */
  storageAccounts?: StorageAccountResponse[];
  /**
   * Will return true if the creation of a storage account is still pending.
   * @param storageAccountName The identified for the account which is being created
   */
  isStorageCreating(storageAccountName: string): boolean;
  /**
   * List of all storage accounts which are currently being created.
   *
   * Can be used to display skeleton accounts and provide user feedback
   */
  pendingStorageAccounts: StorageAccountInfo[];
  /**
   * Check if a specific action is currently being perform on a file account
   * @param file
   * @param action Optional param, if not provided then function will just return if any action is pending
   */
  isFileActionPending(
    file: ShdwFileAccount,
    action?: FileAccountAction
  ): boolean;
  /**
   * Check if a specific action is currently being perform on a storage account
   * @param account Storage account response
   * @param action Optional param, if not provided then function will just return if any action is pending
   */
  isStorageActionPending(
    account: StorageAccountResponse,
    action?: StorageAccountAction
  ): boolean;
  getAccountFiles(storageAcount: StorageAccountResponse): ShadowFileData[];
  /**
   * Err, cancel deletion of a file which is `toBeDeleted`
   */
  cancelFileDeletion: (file: ShadowFileData) => Promise<void>;
  /**
   * Cancel deletion of a storage which is `toBeDeleted`
   */
  cancelDeleteStorageAccount: (
    account: StorageAccountResponse
  ) => Promise<void>;
  /**
   * Copy the file's url to the clipboard
   */
  copyToClipboard: (file: ShadowFileData) => void;
  /**
   * Add a new storage accout
   */
  createAccount: (data: StorageAccountInfo) => Promise<void>;
  /**
   * Mark a file for deletion
   */
  deleteFile: (file: ShadowFileData) => Promise<void>;
  /**
   * Mark provided storage account for deletion
   */
  deleteStorageAccount: (account: StorageAccountResponse) => Promise<void>;
  /**
   * Make the storage account immutable
   */
  makeStorageAccountImmutable: (
    account: StorageAccountResponse
  ) => Promise<void>;
  /**
   * Refresh account beloinging to active wallet/connection
   */
  refreshAccounts: () => Promise<void>;
  /**
   * Refresh data for an individual account
   */
  refreshAccount: (
    accountResponse: StorageAccountResponse
  ) => Promise<StorageAccount>;
  refreshAccountFiles: (account: StorageAccountResponse) => Promise<void>;
  /**
   * Replace a file, assuming it's mutable, for a storage account
   */
  replaceFile: (
    fileData: ShadowFileData,
    replacementFile: File
  ) => Promise<void>;
  /**
   * Upload files to provided storage account
   * @param files FileList object
   */
  uploadFiles: (
    account: StorageAccountResponse,
    files: FileList
  ) => Promise<ShadowBatchUploadResponse[]>;
};

export enum RequestError {
  DriveNotInitialised = "DriveNotInitialised",
  StorageImmutable = "StorageImmutable",
  UserRejection = "UserRejection",
}

const fileIdentity = (file: ShdwFileAccount) =>
  file.storageAccount.toString() + file.name;

export function useShadowDrive({
  pollingInterval,
  onCopiedToClipboard,
  onFileRequestSuccess,
  onFileRequestError,
  onStorageAccountRefreshError,
  onStorageRequestError,
  onStorageRequestSuccess,
}: UseShadowDriveOptions): UseShadowDriveReturnValue {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [loading, setLoading] = useState(false);
  const [fileActions, setFileActions] = useState<FileActions>({});
  const [storageActions, setStorageActions] = useState<StorageActions>({});
  const [accountsCreation, setAccountsCreation] = useState<
    Record<string, StorageAccountInfo | undefined>
  >({});
  const [drive, setDrive] = useState<ShdwDrive>();
  const [storageAccounts, setStorageAccounts] =
    useState<StorageAccountResponse[]>();
  const [filesByKey, setFilesByStorageKey] = useState<FilesRecord>({});
  const copyToClipboard = (fileData: ShadowFileData): void => {
    navigator.clipboard.writeText(
      getShadowDriveFileUrl(
        fileData.account.storageAccount.toString(),
        fileData.account.name
      )
    );

    onCopiedToClipboard?.();
  };

  const updateFileAction = (
    file: ShdwFileAccount,
    action?: FileAccountAction
  ) => {
    setFileActions({
      ...fileActions,
      [fileIdentity(file)]: action,
    });
  };

  const updateStorageAction = (
    account: StorageAccountResponse,
    action?: StorageAccountAction
  ) => {
    setStorageActions({
      ...storageActions,
      [account.publicKey.toString()]: action,
    });
  };

  const replaceStorageAccount = (
    replacement: StorageAccount,
    accountKey: PublicKey
  ) => {
    return storageAccounts.map((storageAccount) => {
      if (storageAccount.publicKey.equals(accountKey)) {
        return {
          account: replacement,
          publicKey: accountKey,
        };
      }

      return storageAccount;
    });
  };

  const refreshAccountFiles = useCallback(
    async (account: StorageAccountResponse) => {
      const fileAccounts = await getFileAccounts(account, connection);

      setFilesByStorageKey({
        ...filesByKey,
        [account.publicKey.toString()]: fileAccounts,
      });
    },
    [connection, filesByKey]
  );

  const getFilesForAllStorageAccounts = useCallback(
    async (accounts: StorageAccountResponse[]) => {
      try {
        const fileAccounts = await Promise.all(
          accounts.map(async (account) => {
            const publicKeyString = account.publicKey.toString();

            const fileAccounts = await getFileAccounts(account, connection);

            return {
              fileAccounts,
              publicKeyString,
            };
          })
        );

        setFilesByStorageKey(
          fileAccounts.reduce((acc, next) => {
            acc[next.publicKeyString] = next.fileAccounts;
            return acc;
          }, {} as Record<string, ShadowFileData[]>)
        );
      } catch (e) {
        console.error(e);

        throw e;
      }
    },
    [connection, setFilesByStorageKey]
  );

  const assertDrive = () => {
    if (!drive) {
      throw new Error(RequestError.DriveNotInitialised);
    }
  };

  const refreshAccount = async (accountResponse: StorageAccountResponse) => {
    assertDrive();
    const { publicKey } = accountResponse;

    try {
      setLoading(true);
      const refreshedAccount = await drive.getStorageAccount(publicKey);

      setStorageAccounts(replaceStorageAccount(refreshedAccount, publicKey));

      return refreshedAccount;
    } catch (e) {
      console.error(e);

      onStorageAccountRefreshError?.(accountResponse);

      throw e;
    } finally {
      setLoading(false);
    }
  };

  const refreshAccounts = useCallback(async () => {
    assertDrive();

    try {
      setLoading(true);
      const accounts = await drive.getStorageAccounts();

      setStorageAccounts(accounts);

      getFilesForAllStorageAccounts(accounts);
    } catch (e) {
      console.error(e);

      throw e;
    } finally {
      setLoading(false);
    }
  }, [drive]);

  const createAccount = useCallback(
    async (data: StorageAccountInfo) => {
      assertDrive();

      const { accountName } = data;

      try {
        setAccountsCreation({
          ...accountsCreation,
          [accountName]: data,
        });
        const createAccountResponse = await drive.createStorageAccount(
          accountName,
          data.storageSpace + data.storageUnit
        );

        const publicKey = new PublicKey(createAccountResponse.shdw_bucket);

        try {
          const account = await drive.getStorageAccount(publicKey);
          console.log("new account", account);

          setStorageAccounts(storageAccounts.concat({ account, publicKey }));
        } catch (e) {
          //
          console.error(e);
        }

        onStorageRequestSuccess?.("creating", accountName);
      } catch (e) {
        console.error(e);
        onStorageRequestError?.("creating", accountName);

        throw e;
      } finally {
        setAccountsCreation({
          ...accountsCreation,
          [data.accountName]: undefined,
        });
      }
    },
    [drive, storageAccounts]
  );

  const updateFileByKey = (
    fileKey: PublicKey,
    updatedFile: ShdwFileAccount
  ) => {
    const accountKeyString = updatedFile.storageAccount.toString();
    setFilesByStorageKey({
      ...filesByKey,
      [accountKeyString]: filesByKey[accountKeyString].map((fileData) => {
        if (fileData.key.equals(fileKey)) {
          return {
            key: fileData.key,
            account: updatedFile,
          };
        }

        return fileData;
      }),
    });
  };

  const replaceFile = useCallback(
    async (fileData: ShadowFileData, replacementFile: File) => {
      assertDrive();

      const fileName = fileData.account.name;
      try {
        updateFileAction(fileData.account, "replacing");
        const accountKeyString = fileData.account.storageAccount.toString();
        await drive.editFile(
          fileData.account.storageAccount,
          getShadowDriveFileUrl(accountKeyString, fileName),
          new File([replacementFile], fileName, { type: replacementFile.type })
        );

        // Replace file in account/file map
        const updatedFile = await getFileAccount(fileData.key, connection);
        updateFileByKey(fileData.key, updatedFile);

        // Available storage will change so update account to *hopefully* get latest value
        refreshAccount(
          storageAccounts.find((acc) =>
            acc.publicKey.equals(fileData.account.storageAccount)
          )
        );

        onFileRequestSuccess?.("replacing", fileName, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("replacing", fileName);

        throw e;
      } finally {
        updateFileAction(fileData.account);
      }
    },
    [drive, refreshAccount]
  );

  const uploadFiles = async (
    accountResponse: StorageAccountResponse,
    files: FileList
  ) => {
    assertDrive();

    const namesArr = Array.from(files).map((f) => f.name);
    const names = namesArr.join();

    try {
      const response = await drive.uploadMultipleFiles(
        accountResponse.publicKey,
        files
      );

      console.log(response);

      if (response.some((r) => !r.transaction_signature)) {
        throw new Error(RequestError.UserRejection);
      }

      onFileRequestSuccess?.("uploading", names);

      refreshAccount(accountResponse);
      refreshAccountFiles(accountResponse);

      pollRequest({
        request: async () => {
          const latestStorageAccount = await drive.getStorageAccount(
            accountResponse.publicKey
          );
          return getFileAccounts(
            {
              account: latestStorageAccount,
              publicKey: accountResponse.publicKey,
            },
            connection
          );
        },
        shouldStop: (files) => {
          const r = namesArr.every((name) =>
            files.some((r) => r.account.name === name)
          );
          console.log(
            r,
            namesArr,
            files.map((f) => f.account.name)
          );
          return r;
        },
        onFailure: () => {},
        onStop: (replacement) => {
          const key = accountResponse.publicKey.toString();
          setFilesByStorageKey({
            ...filesByKey,
            [key]: replacement,
          });
          // updateFileAction(fileData.account);
        },
        timeout: pollingInterval,
      });

      return response;
    } catch (e) {
      console.error(e);

      onFileRequestError?.("uploading", names);
      throw e;
    }
  };

  const deleteFile = useCallback(
    async (fileData: ShadowFileData) => {
      assertDrive();

      const { name, storageAccount } = fileData.account;
      try {
        updateFileAction(fileData.account, "deleting");

        await drive.deleteFile(
          storageAccount,
          getShadowDriveFileUrl(
            storageAccount.toString(),
            fileData.account.name
          )
        );

        updateFileAction(fileData.account, "polling");
        pollRequest({
          request: () => getFileAccount(fileData.key, connection),
          shouldStop: (account) => account.toBeDeleted,
          onFailure: () => updateFileAction(fileData.account),
          onStop: (replacement) => {
            updateFileByKey(fileData.key, replacement);
            updateFileAction(fileData.account);
          },
          timeout: pollingInterval,
        });

        onFileRequestSuccess?.("deleting", name, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("deleting", name, fileData);
        updateFileAction(fileData.account);
        throw e;
      }
    },
    [drive, connection, updateFileByKey]
  );

  const cancelFileDeletion = async (fileData: ShadowFileData) => {
    assertDrive();

    const { name, storageAccount } = fileData.account;
    try {
      updateFileAction(fileData.account, "cancellingDeletion");

      await drive.cancelDeleteFile(
        storageAccount,
        getShadowDriveFileUrl(storageAccount.toString(), fileData.account.name)
      );

      onFileRequestSuccess?.("cancellingDeletion", name, fileData);
      updateFileAction(fileData.account, "polling");
      pollRequest({
        request: () => getFileAccount(fileData.key, connection),
        shouldStop: (account) => !account.toBeDeleted,
        onFailure: () => updateFileAction(fileData.account),
        onStop: (replacement) => {
          updateFileByKey(fileData.key, replacement);
          updateFileAction(fileData.account);
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      console.error(e);
      onFileRequestError?.("cancellingDeletion", name, fileData);
      updateFileAction(fileData.account);
      throw e;
    }
  };

  const deleteStorageAccount = async (
    accountResponse: StorageAccountResponse
  ) => {
    assertDrive();

    const { identifier } = accountResponse.account;
    try {
      updateStorageAction(accountResponse, "deleting");
      await drive.deleteStorageAccount(accountResponse.publicKey);

      onStorageRequestSuccess?.("deleting", identifier, accountResponse);

      updateStorageAction(accountResponse, "polling");
      pollRequest({
        request: () => drive.getStorageAccount(accountResponse.publicKey),
        shouldStop: (account) => account.toBeDeleted,
        onFailure: () => updateStorageAction(accountResponse),
        onStop: (account) => {
          setStorageAccounts(
            replaceStorageAccount(account, accountResponse.publicKey)
          );
          updateStorageAction(accountResponse);
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      console.error(e);

      onStorageRequestError?.("deleting", identifier, accountResponse);
      updateStorageAction(accountResponse);
      throw e;
    }
  };

  const cancelDeleteStorageAccount = useCallback(
    async (accountResponse: StorageAccountResponse) => {
      assertDrive();

      const { identifier } = accountResponse.account;
      try {
        updateStorageAction(accountResponse, "cancellingDeletion");

        await drive.cancelDeleteStorageAccount(accountResponse.publicKey);

        onStorageRequestSuccess?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );

        updateStorageAction(accountResponse, "polling");
        pollRequest({
          request: () => drive.getStorageAccount(accountResponse.publicKey),
          shouldStop: (account) => !account.toBeDeleted,
          onFailure: () => updateStorageAction(accountResponse),
          onStop: (replacement) => {
            updateStorageAction(accountResponse);
            setStorageAccounts(
              replaceStorageAccount(replacement, accountResponse.publicKey)
            );
          },
        });
      } catch (e) {
        console.error(e);

        onStorageRequestError?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );
        updateStorageAction(accountResponse);
        throw e;
      }
    },
    [drive, refreshAccount]
  );

  const makeStorageAccountImmutable = async (
    accountResponse: StorageAccountResponse
  ) => {
    assertDrive();
    if (accountResponse.account.immutable) {
      throw new Error(RequestError.StorageImmutable);
    }

    try {
      updateStorageAction(accountResponse, "makingImmutable");
      await drive.makeStorageImmutable(accountResponse.publicKey);

      refreshAccount(accountResponse);

      onStorageRequestSuccess?.(
        "makingImmutable",
        accountResponse.account.identifier,
        accountResponse
      );
    } catch (e) {
      onStorageRequestError?.(
        "makingImmutable",
        accountResponse.account.identifier,
        accountResponse
      );
      throw e;
    } finally {
      updateStorageAction(accountResponse);
    }
  };

  const createDrive = async () => {
    if (!wallet?.publicKey) return;

    try {
      // clear data for new connection.
      setFilesByStorageKey({});

      setLoading(true);
      const drive = await new ShdwDrive(connection, wallet).init();
      setDrive(drive);
    } catch (e) {
      console.error(e);

      throw e;
    } finally {
      setLoading(false);
    }
  };

  const isFileActionPending = (
    file: ShdwFileAccount,
    action?: FileAccountAction
  ) =>
    action
      ? fileActions[fileIdentity(file)] === action
      : typeof fileActions[fileIdentity(file)] !== "undefined";

  const isStorageActionPending = (
    account: StorageAccountResponse,
    action?: StorageAccountAction
  ) =>
    action
      ? storageActions[account.publicKey.toString()] === action
      : typeof storageActions[account.publicKey.toString()] !== "undefined";

  useEffect(() => {
    if (drive) {
      refreshAccounts();
    }
  }, [drive]);

  useEffect(() => {
    createDrive();
  }, [connection, wallet?.publicKey]);

  const pendingStorageAccounts: StorageAccountInfo[] = Object.values(
    accountsCreation
  ).filter((info) => !!info);

  return {
    isFileActionPending,
    isStorageActionPending,
    loading,
    storageAccounts,
    pendingStorageAccounts,
    refreshAccountFiles,
    isStorageCreating(fileName: string) {
      return !!accountsCreation[fileName];
    },
    getAccountFiles(storageAcount: StorageAccountResponse) {
      return filesByKey[storageAcount.publicKey.toString()] || [];
    },
    copyToClipboard,
    createAccount,
    cancelDeleteStorageAccount,
    cancelFileDeletion,
    deleteFile,
    deleteStorageAccount,
    makeStorageAccountImmutable,
    refreshAccounts,
    refreshAccount,
    replaceFile,
    uploadFiles,
  };
}
