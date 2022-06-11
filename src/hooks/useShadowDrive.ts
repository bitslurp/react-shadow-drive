import {
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
  | "makingImmutable"
  | "cancellingDeletion";

export type FileAccountAction =
  | "deleting"
  | "uploading"
  | "replacing"
  | "cancellingDeletion";

type FileActions = Record<string, FileAccountAction>;
export type FilesRecord = Record<string, ShadowFileData[]>;

export type UseShadowDriveOptions = {
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
  cancellingDeleteAccount: boolean;

  deletingAccount: boolean;
  /**
   * Whether general requests are in progress, such as the request for storage accounts
   */
  loading: boolean;
  /**
   * Array of storage accounts belonging to active wallet
   */
  storageAccounts?: StorageAccountResponse[];

  isFileUpdating(file: ShdwFileAccount): boolean;

  isFileDeleting(file: ShdwFileAccount): boolean;

  isFileReplacing(file: ShdwFileAccount): boolean;

  getAccountFiles(storageAcount: StorageAccountResponse): ShadowFileData[];

  cancelFileDeletion: (file: ShadowFileData) => Promise<void>;
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
  ) => Promise<void>;
};

export enum RequestError {
  DriveNotInitialised = "DriveNotInitialised",
  StorageImmutable = "StorageImmutable",
}

const fileIdentity = (file: ShdwFileAccount) =>
  file.storageAccount.toString() + file.name;

export function useShadowDrive({
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
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [fileActions, setFileActions] = useState<FileActions>({});
  const [cancellingDeleteAccount, setCancellingDeleteAccount] = useState(false);
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

  const replaceStorageAccount = useCallback(
    (replacement: StorageAccount, accountKey: PublicKey) => {
      return storageAccounts.map((storageAccount) => {
        if (storageAccount.publicKey.equals(accountKey)) {
          return {
            account: replacement,
            publicKey: accountKey,
          };
        }

        return storageAccount;
      });
    },
    [storageAccounts]
  );

  const getFiles = useCallback(
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
    [connection]
  );

  const assertDrive = () => {
    if (!drive) {
      throw new Error(RequestError.DriveNotInitialised);
    }
  };

  const refreshAccount = useCallback(
    async (accountResponse: StorageAccountResponse) => {
      assertDrive();
      const { publicKey } = accountResponse;

      try {
        setLoading(true);
        const refreshedAccount = await drive.getStorageAccount(publicKey);

        setStorageAccounts(replaceStorageAccount(refreshedAccount, publicKey));
      } catch (e) {
        console.error(e);

        onStorageAccountRefreshError?.(accountResponse);

        throw e;
      } finally {
        setLoading(false);
      }
    },
    [drive, replaceStorageAccount]
  );

  const refreshAccounts = useCallback(async () => {
    assertDrive();

    try {
      setLoading(true);
      const accounts = await drive.getStorageAccounts();

      setStorageAccounts(accounts);

      getFiles(accounts);
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

      try {
        const createAccountResponse = await drive.createStorageAccount(
          data.accountName,
          data.storageSpace + data.storageUnit
        );

        const publicKey = new PublicKey(createAccountResponse.shdw_bucket);

        try {
          const account = await drive.getStorageAccount(publicKey);

          setStorageAccounts(storageAccounts.concat({ account, publicKey }));
        } catch (e) {
          //
        }

        onStorageRequestSuccess?.("creating", data.accountName);
      } catch (e) {
        console.error(e);
        onStorageRequestError?.("creating", data.accountName);

        throw e;
      }
    },
    [drive]
  );

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
          new File([replacementFile], fileName)
        );

        // Replace file in account/file map
        const updatedFile = await getFileAccount(fileData.key, connection);
        setFilesByStorageKey({
          ...filesByKey,
          [accountKeyString]: filesByKey[accountKeyString].map((fileData) => {
            if (fileData.key.equals(fileData.key)) {
              return {
                key: fileData.key,
                account: updatedFile,
              };
            }

            return fileData;
          }),
        });

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
    [drive]
  );

  const uploadFiles = useCallback(
    async (accountResponse: StorageAccountResponse, files: FileList) => {
      assertDrive();

      const names = Array.from(files)
        .map((f) => f.name)
        .join();
      try {
        await drive.uploadMultipleFiles(accountResponse.publicKey, files);

        onFileRequestSuccess?.("uploading", names);

        refreshAccount(accountResponse);
      } catch (e) {
        console.error(e);

        onFileRequestError?.("uploading", names);
        throw e;
      }
    },
    [drive]
  );

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

        onFileRequestSuccess?.("deleting", name, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("deleting", name, fileData);

        throw e;
      } finally {
        updateFileAction(fileData.account);
      }
    },
    [drive]
  );

  const cancelFileDeletion = useCallback(
    async (fileData: ShadowFileData) => {
      assertDrive();

      const { name, storageAccount } = fileData.account;
      try {
        updateFileAction(fileData.account, "cancellingDeletion");

        await drive.cancelDeleteFile(
          storageAccount,
          getShadowDriveFileUrl(
            storageAccount.toString(),
            fileData.account.name
          )
        );

        onFileRequestSuccess?.("cancellingDeletion", name, fileData);
      } catch (e) {
        console.error(e);
        onFileRequestError?.("cancellingDeletion", name, fileData);

        throw e;
      } finally {
        updateFileAction(fileData.account);
      }
    },
    [drive]
  );

  const deleteStorageAccount = useCallback(
    async (accountResponse: StorageAccountResponse) => {
      assertDrive();

      const { identifier } = accountResponse.account;
      try {
        setDeletingAccount(true);
        await drive.deleteStorageAccount(accountResponse.publicKey);

        onStorageRequestSuccess?.("deleting", identifier, accountResponse);
        refreshAccount(accountResponse);
      } catch (e) {
        console.error(e);

        onStorageRequestError?.("deleting", identifier, accountResponse);
        throw e;
      } finally {
        setDeletingAccount(false);
      }
    },
    [drive]
  );

  const cancelDeleteStorageAccount = useCallback(
    async (accountResponse: StorageAccountResponse) => {
      assertDrive();

      const { identifier } = accountResponse.account;
      try {
        setCancellingDeleteAccount(true);
        await drive.cancelDeleteStorageAccount(accountResponse.publicKey);

        onStorageRequestSuccess?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );
        refreshAccount(accountResponse);
      } catch (e) {
        console.error(e);

        onStorageRequestError?.(
          "cancellingDeletion",
          identifier,
          accountResponse
        );
        throw e;
      } finally {
        setCancellingDeleteAccount(false);
      }
    },
    [drive]
  );

  const makeStorageAccountImmutable = async (
    accountResponse: StorageAccountResponse
  ) => {
    assertDrive();
    if (accountResponse.account.immutable) {
      throw new Error(RequestError.StorageImmutable);
    }

    try {
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

  const isFileUpdating = (file: ShdwFileAccount) =>
    typeof fileActions[fileIdentity(file)] !== "undefined";

  useEffect(() => {
    if (drive) {
      refreshAccounts();
    }
  }, [drive]);

  useEffect(() => {
    createDrive();
  }, [connection, wallet?.publicKey]);

  return {
    isFileUpdating,
    isFileReplacing: (file) => fileActions[fileIdentity(file)] === "replacing",
    isFileDeleting: (file) => fileActions[fileIdentity(file)] === "deleting",
    loading,
    cancellingDeleteAccount,
    deletingAccount,
    storageAccounts,
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
    replaceFile,
    uploadFiles,
  };
}
