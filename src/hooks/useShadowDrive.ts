import {
  ShadowBatchUploadResponse,
  ShdwDrive,
  StorageAccountInfo,
} from "@shadow-drive/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import {
  decryptFile,
  encryptFile,
  getCryptoKey,
  getKeySalt,
  isBufferEncryped,
} from "../utils/encryption";
import { swapToShdw } from "../utils/jup-ag";
import {
  accountResponseToInfo,
  getFiles,
  getShadowDriveFileUrl,
  pollRequest,
  ShadowFileData,
  ShadowStorageConfig,
  toShdwCost,
} from "../utils/shadow-drive";

const SHDW_DRIVE_VERSION = "v2";

type PaymentTokenOptions = "SOL" | "USDC" | "SHDW";
export type StorageAccountData = {
  accountName: string;
  storageSpace: string;
  storageUnit: string;
  paymentToken?: PaymentTokenOptions;
};

export type StorageAccountAction =
  | "fetchingFiles"
  | "fetching"
  | "creating"
  | "deleting"
  | "polling"
  | "makingImmutable"
  | "reducingSize"
  | "cancellingDeletion";

export type FileAction = "deleting" | "polling" | "uploading" | "replacing";

type FileActions = Record<string, FileAction[]>;
type StorageActions = Record<string, StorageAccountAction[]>;
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
   * Whether general requests are in progress
   */
  loading: boolean;
  /**
   * True if loading storage accounts
   */
  loadingAccounts: boolean;
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
  createStorageAccount: (
    data: StorageAccountData
  ) => Promise<StorageAccountInfo>;
  /**
   * Mark a file for deletion
   */
  deleteFile: (file: ShadowFileData) => Promise<void>;
  /**
   * Mark provided storage account for deletion
   */
  deleteStorageAccount: (account: StorageAccountInfo) => Promise<void>;
  /**
   * Download file. If encrypted, the file will be decrypted after being fetched
   * which will request user sign to create CryptoKey input.
   */
  fetchFile: (file: ShadowFileData) => Promise<File>;
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
  refreshStorageAccounts: () => Promise<StorageAccountInfo[]>;
  /**
   * Refresh data for an individual account
   */
  refreshStorageAccount: (
    accountResponse: StorageAccountInfo
  ) => Promise<StorageAccountInfo>;
  refreshStorageAccountFiles: (
    account: StorageAccountInfo
  ) => Promise<ShadowFileData[]>;
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
    files: File[],
    encrypt?: boolean
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
}: UseShadowDriveOptions = {}): UseShadowDriveReturnValue {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [storageConfig, setStorageConfig] = useState<ShadowStorageConfig>();
  const [loadingAccounts, setLoadingAccounts] = useState(false);
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

  const addFileAction = (file: ShadowFileData, action: FileAction) => {
    const id = fileIdentity(file);
    setFileActions((fileActions) => ({
      ...fileActions,
      [id]: (fileActions[id] || []).concat(action),
    }));
  };

  const removeFileAction = (file: ShadowFileData, action: FileAction) => {
    const id = fileIdentity(file);

    setFileActions((fileActions) => {
      const actions = fileActions[id] || [];
      return {
        ...fileActions,
        [id]: actions.filter((a) => a !== action),
      };
    });
  };

  const addStorageAction = (
    account: StorageAccountInfo,
    action: StorageAccountAction
  ) => {
    const key = account.storage_account.toString();

    setStorageActions((storageActions) => {
      const actions = storageActions[key] || [];
      return {
        ...storageActions,
        [key]: actions.concat(action),
      };
    });
  };

  const removeStorageAction = (
    account: StorageAccountInfo,
    action: StorageAccountAction
  ) => {
    setStorageActions((storageActions) => {
      const key = account.storage_account.toString();
      const actions = storageActions[key] || [];
      return {
        ...storageActions,
        [key]: actions.filter((a) => a !== action),
      };
    });
  };

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

  const refreshStorageAccountFiles = async (account: StorageAccountInfo) => {
    try {
      addStorageAction(account, "fetchingFiles");
      const files = await getFiles(account.storage_account, drive);

      setFilesByStorageKey({
        ...filesByKey,
        [account.storage_account.toString()]: files,
      });

      return files;
    } catch (e) {
      //
    } finally {
      removeStorageAction(account, "fetchingFiles");
    }
  };

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

  const refreshStorageAccount = async (accountInfo: StorageAccountInfo) => {
    assertDrive();
    const { storage_account: publicKey } = accountInfo;

    try {
      addStorageAction(accountInfo, "fetching");
      const refreshedAccount = await getStorageAccount(publicKey);

      setStorageAccounts(replaceStorageAccount(refreshedAccount));

      return refreshedAccount;
    } catch (e) {
      console.error(e);

      onStorageAccountRefreshError?.(accountInfo);

      throw e;
    } finally {
      removeStorageAction(accountInfo, "fetching");
    }
  };

  const refreshStorageAccounts = useCallback(async () => {
    assertDrive();

    try {
      setLoadingAccounts(true);
      const accounts = (await drive.getStorageAccounts(SHDW_DRIVE_VERSION)).map(
        accountResponseToInfo
      );

      setStorageAccounts(accounts);
      return accounts;
    } catch (e) {
      console.error(e);

      throw e;
    } finally {
      setLoadingAccounts(false);
    }
  }, [drive]);

  const createStorageAccount = async (data: StorageAccountData) => {
    assertDrive();

    const { accountName } = data;

    try {
      setAccountsCreation({
        ...accountsCreation,
        [accountName]: data,
      });

      if (data.paymentToken && data.paymentToken !== "SHDW") {
        const amount = toShdwCost(
          storageConfig.shadesPerGib.toNumber(),
          data.storageSpace + data.storageUnit
        );
        await swapToShdw(wallet, connection, amount, data.paymentToken);
      }

      const createAccountResponse = await drive.createStorageAccount(
        accountName,
        data.storageSpace + data.storageUnit,
        SHDW_DRIVE_VERSION
      );

      const publicKey = new PublicKey(createAccountResponse.shdw_bucket);

      try {
        const account = await getStorageAccount(publicKey);
        setStorageAccounts(storageAccounts.concat(account));
        return account;
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
  };

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

  const replaceFile = async (
    fileData: ShadowFileData,
    replacementFile: File
  ) => {
    assertDrive();

    const fileName = fileData.name;
    try {
      addFileAction(fileData, "replacing");

      await drive.editFile(
        fileData.storageAccount,
        getShadowDriveFileUrl(fileData),
        new File([replacementFile], fileName, { type: replacementFile.type }),
        SHDW_DRIVE_VERSION
      );

      onFileRequestSuccess?.("replacing", fileName, fileData);
    } catch (e) {
      console.error(e);
      onFileRequestError?.("replacing", fileName);
      throw e;
    } finally {
      removeFileAction(fileData, "replacing");
    }
  };

  const uploadFiles = async (
    storageAccountInfo: StorageAccountInfo,
    files: Iterable<File>,
    encrypt?: boolean
  ) => {
    assertDrive();

    const filesArr = Array.from(files);
    const namesArr = filesArr.map((f) => f.name);
    const names = namesArr.join();

    try {
      let response: ShadowBatchUploadResponse[];

      if (encrypt) {
        const salt = getKeySalt();
        const key = await getCryptoKey(
          wallet,
          storageAccountInfo.storage_account.toString(),
          salt
        );
        const encryptedFiles = await Promise.all(
          filesArr.map((file) => encryptFile(key, file, salt))
        );
        response = await drive.uploadMultipleFiles(
          storageAccountInfo.storage_account,
          encryptedFiles as any as FileList
        );
      } else {
        response = await drive.uploadMultipleFiles(
          storageAccountInfo.storage_account,
          files as any as FileList
        );
      }

      // crypto.subtle.encrypt();

      // if (response.some((r) => !r.status)) {
      //   throw new Error(RequestError.UserRejection);
      // }

      onFileRequestSuccess?.(
        "uploading",
        names.length > 150 ? names.substring(0, 150) + "..." : names
      );

      refreshStorageAccount(storageAccountInfo);
      refreshStorageAccountFiles(storageAccountInfo);

      pollRequest({
        request: async () => {
          const latestStorageAccount = await getStorageAccount(
            storageAccountInfo.storage_account
          );
          return getFiles(latestStorageAccount.storage_account, drive);
        },
        shouldStop: (files) =>
          namesArr.every((name) => files.some((r) => r.name === name)),
        onFailure: () => {},
        onStop: (replacement) => {
          const key = storageAccountInfo.storage_account.toString();
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

  const fetchFile = async (fileData: ShadowFileData) => {
    const url = getShadowDriveFileUrl(fileData);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const file = new File([arrayBuffer], fileData.name, {
      type: response.headers.get("Content-Type"),
    });

    const encrypted = isBufferEncryped(arrayBuffer);

    if (encrypted) {
      return decryptFile(wallet, fileData.storageAccount.toString(), file);
    }

    return file;
  };

  const deleteFile = useCallback(
    async (fileData: ShadowFileData) => {
      assertDrive();

      const { name, storageAccount } = fileData;
      try {
        addFileAction(fileData, "deleting");

        await drive.deleteFile(
          storageAccount,
          getShadowDriveFileUrl(fileData),
          SHDW_DRIVE_VERSION
        );
        removeFileAction(fileData, "deleting");

        addFileAction(fileData, "polling");
        pollRequest({
          request: () => getFiles(fileData.storageAccount, drive),
          shouldStop: (files) => !files.some((f) => f.name === fileData.name),
          onFailure: () => removeFileAction(fileData, "polling"),
          onStop: (replacement) => {
            const key = setFilesByStorageKey({
              ...filesByKey,
              [fileData.storageAccount.toString()]: replacement,
            });
            removeFileAction(fileData, "polling");
          },
          timeout: pollingInterval,
        });

        onFileRequestSuccess?.("deleting", name, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("deleting", name, fileData);
        removeFileAction(fileData, "deleting");
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
      addStorageAction(accountResponse, "deleting");
      await drive.deleteStorageAccount(
        accountResponse.storage_account,
        SHDW_DRIVE_VERSION
      );

      onStorageRequestSuccess?.("deleting", identifier, accountResponse);
      removeStorageAction(accountResponse, "deleting");

      addStorageAction(accountResponse, "polling");
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: (account) => account.to_be_deleted,
        onFailure: () => removeStorageAction(accountResponse, "polling"),
        onStop: (account) => {
          setStorageAccounts(replaceStorageAccount(account));
          removeStorageAction(accountResponse, "polling");
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      console.error(e);

      onStorageRequestError?.("deleting", identifier, accountResponse);
      removeStorageAction(accountResponse, "deleting");
      throw e;
    }
  };

  const cancelDeleteStorageAccount = useCallback(
    async (accountResponse: StorageAccountInfo) => {
      assertDrive();

      const { identifier } = accountResponse;
      try {
        addStorageAction(accountResponse, "cancellingDeletion");

        await drive.cancelDeleteStorageAccount(
          accountResponse.storage_account,
          SHDW_DRIVE_VERSION
        );

        onStorageRequestSuccess?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );
        removeStorageAction(accountResponse, "cancellingDeletion");
        addStorageAction(accountResponse, "polling");
        pollRequest({
          request: () => getStorageAccount(accountResponse.storage_account),
          shouldStop: (account) => !account.to_be_deleted,
          onFailure: () => removeStorageAction(accountResponse, "polling"),
          onStop: (replacement) => {
            removeStorageAction(accountResponse, "polling");
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
        removeStorageAction(accountResponse, "cancellingDeletion");
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
      addStorageAction(accountResponse, "makingImmutable");
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
      removeStorageAction(accountResponse, "makingImmutable");
      addStorageAction(accountResponse, "polling");
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: ({ immutable }) => immutable,
        onFailure: () => removeStorageAction(accountResponse, "polling"),
        onStop: (replacement) => {
          setStorageAccounts(replaceStorageAccount(replacement));
          removeStorageAction(accountResponse, "polling");
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      onStorageRequestError?.(
        "makingImmutable",
        accountResponse.identifier,
        accountResponse
      );
      removeStorageAction(accountResponse, "makingImmutable");
      throw e;
    }
  };

  const reduceStorage = async (
    accountResponse: StorageAccountInfo,
    size: Pick<StorageAccountData, "storageSpace" | "storageUnit">
  ) => {
    assertDrive();

    try {
      addStorageAction(accountResponse, "reducingSize");
      await drive.reduceStorage(
        accountResponse.storage_account,
        size.storageSpace + size.storageUnit,
        SHDW_DRIVE_VERSION
      );

      removeStorageAction(accountResponse, "reducingSize");
      addStorageAction(accountResponse, "polling");
      onStorageRequestSuccess?.(
        "reducingSize",
        accountResponse.identifier,
        accountResponse
      );
      pollRequest({
        request: () => getStorageAccount(accountResponse.storage_account),
        shouldStop: (response) =>
          response && response.reserved_bytes < accountResponse.reserved_bytes,
        onFailure: () => removeStorageAction(accountResponse, "polling"),
        onStop: (replacement) => {
          removeStorageAction(accountResponse, "polling");
          setStorageAccounts(replaceStorageAccount(replacement));
        },
        timeout: pollingInterval,
      });
    } catch (e) {
      removeStorageAction(accountResponse, "reducingSize");
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

      const [storageConfig] = (await (
        drive as any
      ).program.account.storageConfig.all()) as {
        account: ShadowStorageConfig;
      }[];

      setStorageConfig(storageConfig.account);
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
      ? fileActions[fileIdentity(file)]?.includes(action)
      : fileActions[fileIdentity(file)]?.length > 0;

  const isStorageActionPending = (
    account: StorageAccountInfo,
    action?: StorageAccountAction
  ) => {
    const key = account.storage_account.toString();
    const actions = storageActions[key] || [];
    return action ? actions.includes(action) : actions.length > 0;
  };

  useEffect(() => {
    setDrive(undefined);
    setStorageAccounts(undefined);
    setStorageActions({});
    setFileActions({});
    setFilesByStorageKey({});
    createDrive();
  }, [connection, wallet?.publicKey, wallet.connected]);

  const pendingStorageAccounts: StorageAccountData[] = Object.values(
    accountsCreation
  ).filter((info) => !!info);

  return {
    ready: Boolean(drive),
    isFileActionPending,
    isStorageActionPending,
    loading,
    loadingAccounts,
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
    fetchFile,
    makeStorageAccountImmutable,
    reduceStorage,
    refreshStorageAccounts,
    refreshStorageAccount,
    replaceFile,
    uploadFiles,
  };
}
