import "@project-serum/anchor";
import { ShdwDrive, StorageAccountResponse } from "@shadow-drive/sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFileAccounts,
  getShadowDriveFileUrl,
  ShdwFileAccount,
} from "../utils/shadow-drive";

export type StorageAccountInfo = {
  accountName: string;
  storageSpace: string;
  storageUnit: string;
};

export type FilesRecord = Record<string, ShdwFileAccount[]>;

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
   * Ref object for in context file
   */
  selectedFileRef: React.MutableRefObject<ShdwFileAccount>;
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
  selectedAccountFiles?: ShdwFileAccount[];
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
   * Set the in context account response object.
   *
   * This context will be used for upload, delete requests etc
   */
  setSelectedAccountResponse: (response: StorageAccountResponse) => void;
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
}: UseShadowDriveOptions): UseShadowDriveReturnValue {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [loading, setLoading] = useState(false);
  const selectedFileRef = useRef<ShdwFileAccount>();
  const [drive, setDrive] = useState<ShdwDrive>();
  const [selectedAccountResponse, setSelectedAccountResponse] =
    useState<StorageAccountResponse>();
  const [storageAccounts, setStorageAccounts] =
    useState<StorageAccountResponse[]>();
  const [filesByKey, setFilesByKey] = useState<FilesRecord>({});

  const selectedAccountKey = selectedAccountResponse?.publicKey.toString();
  const copyToClipboard = (): void => {
    if (!selectedAccountKey || !selectedFileRef.current) return;
    navigator.clipboard.writeText(
      getShadowDriveFileUrl(selectedAccountKey, selectedFileRef.current?.name)
    );

    onCopiedToClipboard?.();
  };

  const refreshAccounts = useCallback(async () => {
    if (!drive) return;

    try {
      setLoading(true);
      const accounts = await drive.getStorageAccounts();

      setStorageAccounts(accounts);

      const fileNames = await Promise.all(
        accounts.map(async (account) => {
          const publicKeyString = account.publicKey.toString();

          const fileAccounts = await getFileAccounts(account, connection);

          return {
            fileAccounts,
            publicKeyString,
          };
        })
      );

      setFilesByKey(
        fileNames.reduce((acc, next) => {
          acc[next.publicKeyString] = next.fileAccounts;
          return acc;
        }, {} as Record<string, ShdwFileAccount[]>)
      );
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

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (!drive || !selectedAccountResponse) return;

      await drive.uploadMultipleFiles(selectedAccountResponse.publicKey, files);

      onFilesUploaded?.(Array.from(files).map((f) => f.name));

      refreshAccounts();
    },
    [drive, selectedAccountResponse]
  );

  const deleteSelectedFile = useCallback(async () => {
    if (!drive || !selectedAccountResponse || !selectedFileRef.current) return;

    await drive.deleteFile(
      selectedAccountResponse.publicKey,
      getShadowDriveFileUrl(
        selectedAccountResponse.publicKey.toString(),
        selectedFileRef.current.name
      )
    );

    onFileDeleted?.();

    selectedFileRef.current = undefined;
  }, [drive, selectedAccountResponse]);

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
      setFilesByKey({});

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
    selectedFileRef,
    selectedAccountResponse,
    selectedAccountKey,
    selectedAccountFiles: selectedAccountKey && filesByKey[selectedAccountKey],
    storageAccounts,
    copyToClipboard,
    createAccount,
    deleteSelectedFile,
    refreshAccounts,
    setSelectedAccountResponse,
    uploadFiles,
  };
}
