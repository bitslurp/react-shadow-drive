import {
  ShadowBatchUploadResponse,
  ShdwDrive,
  StorageAccountInfo,
} from "@shadow-drive/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import {
  accountResponseToInfo,
  getFiles,
  getShadowDriveFileUrl,
  pollRequest,
  ShadowFileData,
} from "../utils/shadow-drive";

const SHDW_DRIVE_VERSION = "v2";

export type StorageAccountData = {
  accountName: string;
  storageSpace: string;
  storageUnit: string;
};

export type StorageAccountAction =
  | "creating"
  | "deleting"
  | "polling"
  | "makingImmutable"
  | "reducingSize"
  | "cancellingDeletion";

export type FileAction =
  | "deleting"
  | "polling"
  | "uploading"
  | "replacing"
  | "cancellingDeletion";

type FileActions = Record<string, FileAction>;
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
    action: FileAction,
    descriptor: string,
    file?: ShadowFileData
  ) => void;
  /**
   * Called when a file request action fails
   */
  onFileRequestError?: (
    action: FileAction,
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
  onStorageAccountRefreshError?: (account: StorageAccountInfo) => void;
  /**
   * Called when a storage account request is successful
   */
  onStorageRequestSuccess?: (
    action: StorageAccountAction,
    descriptor: string,
    account?: StorageAccountInfo
  ) => void;
  /**
   * Called when a storage account request fails
   */
  onStorageRequestError?: (
    action: StorageAccountAction,
    descriptor: string,
    account?: StorageAccountInfo
  ) => void;
};

export type UseShadowDriveReturnValue = {
  ready: boolean;
  /**
   * Whether general requests are in progress, such as the request for storage accounts
   */
  loading: boolean;
  /**
   * Array of storage accounts belonging to active wallet
   */
  storageAccounts?: StorageAccountInfo[];
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
  pendingStorageAccounts: StorageAccountData[];
  /**
   * Check if a specific action is currently being perform on a file account
   * @param file
   * @param action Optional param, if not provided then function will just return if any action is pending
   */
  isFileActionPending(file: ShadowFileData, action?: FileAction): boolean;
  /**
   * Check if a specific action is currently being perform on a storage account
   * @param account Storage account response
   * @param action Optional param, if not provided then function will just return if any action is pending
   */
  isStorageActionPending(
    account: StorageAccountInfo,
    action?: StorageAccountAction
  ): boolean;
  getStorageAccountFiles(storageAcount: StorageAccountInfo): ShadowFileData[];
  /**
   * Cancel deletion of a storage which is `toBeDeleted`
   */
  cancelDeleteStorageAccount: (account: StorageAccountInfo) => Promise<void>;
  /**
   * Copy the file's url to the clipboard
   */
  copyToClipboard: (file: ShadowFileData) => void;
  /**
   * Add a new storage accout
   */
  createStorageAccount: (data: StorageAccountData) => Promise<void>;
  /**
   * Mark a file for deletion
   */
  deleteFile: (file: ShadowFileData) => Promise<void>;
  /**
   * Mark provided storage account for deletion
   */
  deleteStorageAccount: (account: StorageAccountInfo) => Promise<void>;
  /**
   * Make the storage account immutable
   */
  makeStorageAccountImmutable: (account: StorageAccountInfo) => Promise<void>;
  /**
   * Reduce storage account size
   */
  reduceStorage: (
    accountResponse: StorageAccountInfo,
    size: Pick<StorageAccountData, "storageSpace" | "storageUnit">
  ) => Promise<void>;
  /**
   * Refresh account belonging to active wallet/connection
   */
  refreshStorageAccounts: () => Promise<void>;
  /**
   * Refresh data for an individual account
   */
  refreshStorageAccount: (
    accountResponse: StorageAccountInfo
  ) => Promise<StorageAccountInfo>;
  refreshStorageAccountFiles: (account: StorageAccountInfo) => Promise<void>;
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
    account: StorageAccountInfo,
    files: FileList
  ) => Promise<ShadowBatchUploadResponse[]>;
};

export enum RequestError {
  DriveNotInitialised = "DriveNotInitialised",
  StorageImmutable = "StorageImmutable",
  UserRejection = "UserRejection",
}

const fileIdentity = (file: ShadowFileData) =>
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
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [fileActions, setFileActions] = useState<FileActions>({});
  const [storageActions, setStorageActions] = useState<StorageActions>({});
  const [accountsCreation, setAccountsCreation] = useState<
    Record<string, StorageAccountData | undefined>
  >({});
  const [drive, setDrive] = useState<ShdwDrive>();
  const [storageAccounts, setStorageAccounts] =
    useState<StorageAccountInfo[]>();
  const [filesByKey, setFilesByStorageKey] = useState<FilesRecord>({});
  const copyToClipboard = (fileData: ShadowFileData): void => {
    navigator.clipboard.writeText(getShadowDriveFileUrl(fileData));

    onCopiedToClipboard?.();
  };

  const updateFileAction = (file: ShadowFileData, action?: FileAction) => {
    setFileActions((fileActions) => ({
      ...fileActions,
      [fileIdentity(file)]: action,
    }));
  };

  const updateStorageAction = (
    account: StorageAccountInfo,
    action?: StorageAccountAction
  ) => {
    setStorageActions((storageActions) => ({
      ...storageActions,
      [account.storage_account.toString()]: action,
    }));
  };

  const clearStorageAction = (account: StorageAccountInfo) =>
    updateStorageAction(account, undefined);

  const replaceStorageAccount = (replacement: StorageAccountInfo) => {
    return storageAccounts.map((storageAccount) => {
      if (storageAccount.storage_account.equals(replacement.storage_account)) {
        return replacement;
      }

      return storageAccount;
    });
  };

  const getStorageAccount = async (publicKey: PublicKey) => {
    const account = await drive.getStorageAccount(publicKey);

    // TODO: storage_acount is a string here but should be pubkey. Remove when fixed.
    account.storage_account = publicKey;

    return account;
  };

  const refreshStorageAccountFiles = useCallback(
    async (account: StorageAccountInfo) => {
      const files = await getFiles(account.storage_account, drive);

      setFilesByStorageKey({
        ...filesByKey,
        [account.storage_account.toString()]: files,
      });
    },
    [connection, filesByKey]
  );

  const getFilesForAllStorageAccounts = useCallback(
    async (accounts: StorageAccountInfo[]) => {
      try {
        const filesWithAccounts = await Promise.all(
          accounts.map(async (account) => {
            const publicKeyString = account.storage_account.toString();

            const files = await getFiles(account.storage_account, drive);

            return {
              files,
              publicKeyString,
            };
          })
        );

        setFilesByStorageKey(
          filesWithAccounts.reduce((acc, next) => {
            acc[next.publicKeyString] = next.files;
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

  const refreshStorageAccount = async (accountResponse: StorageAccountInfo) => {
    assertDrive();
    const { storage_account: publicKey } = accountResponse;

    try {
      setLoading(true);
      const refreshedAccount = await getStorageAccount(publicKey);

      setStorageAccounts(replaceStorageAccount(refreshedAccount));

      return refreshedAccount;
    } catch (e) {
      console.error(e);

      onStorageAccountRefreshError?.(accountResponse);

      throw e;
    } finally {
      setLoading(false);
    }
  };

  const refreshStorageAccounts = useCallback(async () => {
    assertDrive();

    try {
      setLoading(true);
      const accounts = await (
        await drive.getStorageAccounts(SHDW_DRIVE_VERSION)
      ).map(accountResponseToInfo);

      setStorageAccounts(accounts);

      // getFilesForAllStorageAccounts(accounts);
    } catch (e) {
      console.error(e);

      throw e;
    } finally {
      setLoading(false);
    }
  }, [drive]);

  const createStorageAccount = useCallback(
    async (data: StorageAccountData) => {
      assertDrive();

      const { accountName } = data;

      try {
        setAccountsCreation({
          ...accountsCreation,
          [accountName]: data,
        });
        const createAccountResponse = await drive.createStorageAccount(
          accountName,
          data.storageSpace + data.storageUnit,
          SHDW_DRIVE_VERSION
        );

        const publicKey = new PublicKey(createAccountResponse.shdw_bucket);

        try {
          const account = await getStorageAccount(publicKey);
          setStorageAccounts(storageAccounts.concat(account));
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

  const updateFileByKey = (fileKey: string, updatedFile: ShadowFileData) => {
    const accountKeyString = updatedFile.storageAccount.toString();
    setFilesByStorageKey({
      ...filesByKey,
      [accountKeyString]: filesByKey[accountKeyString].map((fileData) => {
        if (fileData.name === fileKey) {
          return updatedFile;
        }

        return fileData;
      }),
    });
  };

  const replaceFile = useCallback(
    async (fileData: ShadowFileData, replacementFile: File) => {
      assertDrive();

      const fileName = fileData.name;
      try {
        updateFileAction(fileData, "replacing");

        await drive.editFile(
          fileData.storageAccount,
          getShadowDriveFileUrl(fileData),
          new File([replacementFile], fileName, { type: replacementFile.type }),
          SHDW_DRIVE_VERSION
        );

        onFileRequestSuccess?.("replacing", fileName, fileData);
      } catch (e) {
        console.error(e);

        throw e;
      } finally {
        onFileRequestError?.("replacing", fileName);
      }
    },
    [drive, refreshStorageAccount]
  );

  const uploadFiles = async (
    accountResponse: StorageAccountInfo,
    files: FileList
  ) => {
    assertDrive();

    const namesArr = Array.from(files).map((f) => f.name);
    const names = namesArr.join();

    try {
      const response = await drive.uploadMultipleFiles(
        accountResponse.storage_account,
        files
      );

      // if (response.some((r) => !r.status)) {
      //   throw new Error(RequestError.UserRejection);
      // }

      onFileRequestSuccess?.("uploading", names);

      refreshStorageAccount(accountResponse);
      refreshStorageAccountFiles(accountResponse);

      pollRequest({
        request: async () => {
          const latestStorageAccount = await getStorageAccount(
            accountResponse.storage_account
          );
          return getFiles(latestStorageAccount.storage_account, drive);
        },
        shouldStop: (files) =>
          namesArr.every((name) => files.some((r) => r.name === name)),
        onFailure: () => {},
        onStop: (replacement) => {
          const key = accountResponse.storage_account.toString();
          setFilesByStorageKey({
            ...filesByKey,
            [key]: replacement,
          });
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

      const { name, storageAccount } = fileData;
      try {
        updateFileAction(fileData, "deleting");

        await drive.deleteFile(
          storageAccount,
          getShadowDriveFileUrl(fileData),
          SHDW_DRIVE_VERSION
        );

        updateFileAction(fileData, "polling");
        pollRequest({
          request: () => getFiles(fileData.storageAccount, drive),
          shouldStop: (files) => !files.some((f) => f.name === fileData.name),
          onFailure: () => updateFileAction(fileData),
          onStop: (replacement) => {
            const key = setFilesByStorageKey({
              ...filesByKey,
              [fileData.storageAccount.toString()]: replacement,
            });
            updateFileAction(fileData);
          },
          timeout: pollingInterval,
        });

        onFileRequestSuccess?.("deleting", name, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("deleting", name, fileData);
        updateFileAction(fileData);
        throw e;
      }
    },
    [drive, connection, updateFileByKey]
  );

  // const cancelFileDeletion = async (fileData: ShadowFileData) => {
  //   assertDrive();

  //   const { name, storageAccount } = fileData;
  //   try {
  //     updateFileAction(fileData, "cancellingDeletion");

  //     await drive.cancelDeleteFile(
  //       storageAccount,
  //       getShadowDriveFileUrl(fileData)
  //     );

  //     onFileRequestSuccess?.("cancellingDeletion", name, fileData);
  //     updateFileAction(fileData, "polling");
  //     pollRequest({
  //       request: () => getFileAccount(fileData.key, connection),
  //       shouldStop: (account) => !account.toBeDeleted,
  //       onFailure: () => updateFileAction(fileData.account),
  //       onStop: (replacement) => {
  //         updateFileByKey(fileData.key, replacement);
  //         updateFileAction(fileData.account);
  //       },
  //       timeout: pollingInterval,
  //     });
  //   } catch (e) {
  //     console.error(e);
  //     onFileRequestError?.("cancellingDeletion", name, fileData);
  //     updateFileAction(fileData.account);
  //     throw e;
  //   }
  // };

  const deleteStorageAccount = async (accountResponse: StorageAccountInfo) => {
    assertDrive();

    const { identifier } = accountResponse;
    try {
      updateStorageAction(accountResponse, "deleting");
      await drive.deleteStorageAccount(
        accountResponse.storage_account,
        SHDW_DRIVE_VERSION
      );

      onStorageRequestSuccess?.("deleting", identifier, accountResponse);

      updateStorageAction(accountResponse, "polling");
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: (account) => account.to_be_deleted,
        onFailure: () => clearStorageAction(accountResponse),
        onStop: (account) => {
          setStorageAccounts(replaceStorageAccount(account));
          clearStorageAction(accountResponse);
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      console.error(e);

      onStorageRequestError?.("deleting", identifier, accountResponse);
      clearStorageAction(accountResponse);
      throw e;
    }
  };

  const cancelDeleteStorageAccount = useCallback(
    async (accountResponse: StorageAccountInfo) => {
      assertDrive();

      const { identifier } = accountResponse;
      try {
        updateStorageAction(accountResponse, "cancellingDeletion");

        await drive.cancelDeleteStorageAccount(
          accountResponse.storage_account,
          SHDW_DRIVE_VERSION
        );

        onStorageRequestSuccess?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );

        updateStorageAction(accountResponse, "polling");
        pollRequest({
          request: () => getStorageAccount(accountResponse.storage_account),
          shouldStop: (account) => !account.to_be_deleted,
          onFailure: () => clearStorageAction(accountResponse),
          onStop: (replacement) => {
            clearStorageAction(accountResponse);
            setStorageAccounts(replaceStorageAccount(replacement));
          },
        });
      } catch (e) {
        console.error(e);

        onStorageRequestError?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );
        clearStorageAction(accountResponse);
        throw e;
      }
    },
    [drive, refreshStorageAccount]
  );

  const makeStorageAccountImmutable = async (
    accountResponse: StorageAccountInfo
  ) => {
    assertDrive();
    if (accountResponse.immutable) {
      throw new Error(RequestError.StorageImmutable);
    }

    try {
      updateStorageAction(accountResponse, "makingImmutable");
      await drive.makeStorageImmutable(
        accountResponse.storage_account,
        SHDW_DRIVE_VERSION
      );

      refreshStorageAccount(accountResponse);

      onStorageRequestSuccess?.(
        "makingImmutable",
        accountResponse.identifier,
        accountResponse
      );

      updateStorageAction(accountResponse, "polling");
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: ({ immutable }) => immutable,
        onFailure: () => clearStorageAction(accountResponse),
        onStop: (replacement) => {
          setStorageAccounts(replaceStorageAccount(replacement));
          clearStorageAction(accountResponse);
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      onStorageRequestError?.(
        "makingImmutable",
        accountResponse.identifier,
        accountResponse
      );
      clearStorageAction(accountResponse);
      throw e;
    }
  };

  const reduceStorage = async (
    accountResponse: StorageAccountInfo,
    size: Pick<StorageAccountData, "storageSpace" | "storageUnit">
  ) => {
    assertDrive();

    try {
      updateStorageAction(accountResponse, "reducingSize");
      await drive.reduceStorage(
        accountResponse.storage_account,
        size.storageSpace + size.storageUnit,
        SHDW_DRIVE_VERSION
      );

      updateStorageAction(accountResponse, "polling");
      onStorageRequestSuccess?.(
        "reducingSize",
        accountResponse.identifier,
        accountResponse
      );
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: (response) =>
          response && response.reserved_bytes < accountResponse.reserved_bytes,
        onFailure: () => clearStorageAction(accountResponse),
        onStop: (replacement) => {
          clearStorageAction(accountResponse);
          setStorageAccounts(replaceStorageAccount(replacement));
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      clearStorageAction(accountResponse);
      onStorageRequestError?.(
        "reducingSize",
        accountResponse.identifier,
        accountResponse
      );

      throw e;
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

  const isFileActionPending = (file: ShadowFileData, action?: FileAction) =>
    action
      ? fileActions[fileIdentity(file)] === action
      : typeof fileActions[fileIdentity(file)] !== "undefined";

  const isStorageActionPending = (
    account: StorageAccountInfo,
    action?: StorageAccountAction
  ) =>
    action
      ? storageActions[account.storage_account.toString()] === action
      : typeof storageActions[account.storage_account.toString()] !==
        "undefined";

  useEffect(() => {
    setDrive(undefined);
    setStorageAccounts(undefined);
    setStorageActions({});
    setFileActions({});
    setFilesByStorageKey({});
    createDrive();
  }, [connection, wallet?.publicKey]);

  const pendingStorageAccounts: StorageAccountData[] = Object.values(
    accountsCreation
  ).filter((info) => !!info);

  return {
    ready: Boolean(drive),
    isFileActionPending,
    isStorageActionPending,
    loading,
    storageAccounts,
    pendingStorageAccounts,
    refreshStorageAccountFiles,
    isStorageCreating(fileName: string) {
      return !!accountsCreation[fileName];
    },
    getStorageAccountFiles(storageAcount: StorageAccountInfo) {
      return filesByKey[storageAcount.storage_account.toString()] || [];
    },
    copyToClipboard,
    createStorageAccount,
    cancelDeleteStorageAccount,
    deleteFile,
    deleteStorageAccount,
    makeStorageAccountImmutable,
    reduceStorage,
    refreshStorageAccounts,
    refreshStorageAccount,
    replaceFile,
    uploadFiles,
  };
}
