import { ShdwDrive, StorageAccountResponse } from "@shadow-drive/sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import {
  getFileAccount,
  getFileAccounts,
  getShadowDriveFileUrl,
  ShadowFileData,
} from "../utils/shadow-drive";

export type StorageAccountInfo = {
  accountName: string;
  storageSpace: string;
  storageUnit: string;
};

export type FilesRecord = Record<string, ShadowFileData[]>;

export type UseShadowDriveOptions = {
  /**
   * Called after file address copied to clipboard
   */
  onCopiedToClipboard?: () => void;
  /**
   * Invoked following successful file deletion flag being set
   */
  onFileDeleted?: () => void;
  /**
   * Invoked after file data has succsesfully been replaced
   */
  onFileReplaced?: () => void;
  /**
   * Invoked following multi file upload success
   */
  onFilesUploaded?: (files: string[]) => void;
  /**
   * Invoked following storage account confirmation.
   */
  onStorageAccountCreated?: () => void;
};

export type UseShadowDriveReturnValue = {
  /**
   * File arrays by storage account public key
   */
  filesByKey: FilesRecord;
  /**
   * Whether general requests are in progress, such as the request for storage accounts
   */
  loading: boolean;
  /**
   * In context file
   */
  selectedFile?: ShadowFileData;
  /**
   * The account response for the selected storage account
   */
  selectedAccountResponse?: StorageAccountResponse;
  /**
   * The public key string for the selected storage account
   */
  selectedAccountKey?: string;
  /**
   * Files belonging to currently selected storage account
   */
  selectedAccountFiles?: ShadowFileData[];
  /**
   * Array of storage accounts belonging to active wallet
   */
  storageAccounts?: StorageAccountResponse[];
  /**
   * Copy the currently selected file's url to the clipboard
   */
  copyToClipboard: () => void;
  /**
   * Add a new storage accout
   */
  createAccount: (data: StorageAccountInfo) => Promise<void>;
  /**
   * Delete a the in currently selected file
   */
  deleteSelectedFile: () => Promise<void>;
  /**
   * Refresh account beloinging to active wallet/connection
   */
  refreshAccounts: () => Promise<void>;
  /**
   * Replace a file, assuming it's mutable, for a storage account
   */
  replaceFile: (file: File) => Promise<void>;
  /**
   * Set the in context account response object.
   *
   * This context will be used for upload, delete requests etc
   */
  setSelectedAccountResponse: (response: StorageAccountResponse) => void;
  /**
   * Set the in context file account object
   *
   * This context will be used for upload, delete requests etc
   */
  setSelectedFile: (fileAccount: ShadowFileData) => void;
  /**
   * Upload files to currently selected storage account
   * @param files FileList object
   */
  uploadFiles: (files: FileList) => Promise<void>;
};

export function useShadowDrive({
  onCopiedToClipboard,
  onFileDeleted,
  onFilesUploaded,
  onStorageAccountCreated,
  onFileReplaced,
}: UseShadowDriveOptions): UseShadowDriveReturnValue {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ShadowFileData>();
  const [drive, setDrive] = useState<ShdwDrive>();
  const [selectedAccountResponse, setSelectedAccountResponse] =
    useState<StorageAccountResponse>();
  const [storageAccounts, setStorageAccounts] =
    useState<StorageAccountResponse[]>();
  const [filesByKey, setFilesByStorageKey] = useState<FilesRecord>({});

  const selectedAccountKey = selectedAccountResponse?.publicKey.toString();
  const copyToClipboard = (): void => {
    if (!selectedAccountKey || !selectedFile) return;

    navigator.clipboard.writeText(
      getShadowDriveFileUrl(selectedAccountKey, selectedFile.account.name)
    );

    onCopiedToClipboard?.();
  };

  const getFiles = useCallback(
    async (accounts: StorageAccountResponse[]) => {
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
    },
    [connection]
  );

  const refreshAccount = useCallback(
    async (accountKey: PublicKey) => {
      if (!drive) {
        throw "Drive not initialised";
      }

      try {
        setLoading(true);
        const refreshedAccount = await drive.getStorageAccount(accountKey);

        setStorageAccounts(
          storageAccounts.map((storageAccount) => {
            if (storageAccount.publicKey.equals(accountKey)) {
              return {
                account: refreshedAccount,
                publicKey: accountKey,
              };
            }

            return storageAccount;
          })
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [drive]
  );

  const refreshAccounts = useCallback(async () => {
    if (!drive) {
      throw "Drive not initialised";
    }

    try {
      setLoading(true);
      const accounts = await drive.getStorageAccounts();

      setStorageAccounts(accounts);

      getFiles(accounts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [drive]);

  const createAccount = useCallback(
    async (data: StorageAccountInfo) => {
      if (!drive) return;

      try {
        await drive.createStorageAccount(
          data.accountName,
          data.storageSpace + data.storageUnit
        );

        refreshAccounts();

        onStorageAccountCreated?.();
      } catch (e) {
        console.error(e);
      }
    },
    [drive]
  );

  const replaceFile = useCallback(
    async (file: File) => {
      if (!drive || !selectedFile || !selectedAccountResponse) return;

      try {
        const accountKeyString = selectedAccountResponse.publicKey.toString();
        const fileName = selectedFile.account.name;

        await drive.editFile(
          selectedAccountResponse.publicKey,
          getShadowDriveFileUrl(accountKeyString, fileName),
          new File([file], fileName)
        );

        // Replace file in account/file map
        const updatedFile = await getFileAccount(selectedFile.key, connection);
        setFilesByStorageKey({
          ...filesByKey,
          [accountKeyString]: filesByKey[accountKeyString].map((fileData) => {
            if (fileData.key.equals(selectedFile.key)) {
              return {
                key: selectedFile.key,
                account: updatedFile,
              };
            }

            return fileData;
          }),
        });

        refreshAccount(selectedAccountResponse.publicKey);

        onFileReplaced?.();
      } catch (e) {
        console.error(e);
      }
    },
    [drive, selectedAccountResponse, selectedFile]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (!drive || !selectedAccountResponse) return;

      await drive.uploadMultipleFiles(selectedAccountResponse.publicKey, files);

      onFilesUploaded?.(Array.from(files).map((f) => f.name));

      refreshAccount(selectedAccountResponse.publicKey);
    },
    [drive, selectedAccountResponse]
  );

  const deleteSelectedFile = useCallback(async () => {
    if (!drive || !selectedAccountResponse || !selectedFile) return;

    await drive.deleteFile(
      selectedAccountResponse.publicKey,
      getShadowDriveFileUrl(
        selectedAccountResponse.publicKey.toString(),
        selectedFile.account.name
      )
    );

    onFileDeleted?.();
    setSelectedFile(undefined);
  }, [drive, selectedAccountResponse, selectedFile]);

  useEffect(() => {
    if (drive) {
      refreshAccounts();
    }
  }, [drive]);

  const createDrive = async () => {
    if (!wallet?.publicKey) return;

    try {
      // clear data for new connection.
      setSelectedAccountResponse(undefined);
      setFilesByStorageKey({});

      setLoading(true);
      const drive = await new ShdwDrive(connection, wallet).init();
      setDrive(drive);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    createDrive();
  }, [connection, wallet?.publicKey]);

  return {
    filesByKey,
    loading,
    selectedFile,
    selectedAccountResponse,
    selectedAccountKey,
    selectedAccountFiles: selectedAccountKey && filesByKey[selectedAccountKey],
    storageAccounts,
    copyToClipboard,
    createAccount,
    deleteSelectedFile,
    refreshAccounts,
    replaceFile,
    setSelectedAccountResponse,
    setSelectedFile,
    uploadFiles,
  };
}
