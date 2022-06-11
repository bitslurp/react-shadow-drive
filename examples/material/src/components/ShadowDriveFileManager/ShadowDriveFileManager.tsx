import { ChevronRight } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import MenuIcon from "@mui/icons-material/MoreVert";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from "@mui/material";
import "@project-serum/anchor";
import { StorageAccountResponse } from "@shadow-drive/sdk";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import format from "date-fns/format";
import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  formatBytes,
  getShadowDriveFileUrl,
  ShadowFileData,
  useShadowDrive,
} from "react-shadow-drive";
import { FileUploadForm } from "../FileUploadForm/FileUploadForm";
import { StorageAccountForm } from "../StorageAccountForm/StorageAccountForm";

export const ShadowDriveFileManager: FunctionComponent<
  PropsWithChildren<{}>
> = () => {
  const { t } = useTranslation();
  const wallet = useAnchorWallet();
  const [fileDeletionDialogOpen, setFileDeletionDialogOpen] = useState(false);
  const [accountDeletionDialogOpen, setAccountDeletionDialogOpen] =
    useState(false);
  const [storageFormOpen, setStorageFormOpen] = useState(false);
  const [fileUploadOpen, setFileUploadOpen] = useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [snackbarMessage, setSnackbarMessage] = useState<string>();
  const [replaceFileDialogOpen, setReplaceFileDialogOpen] = useState(false);
  const handleSnackbardClose = () => setSnackbarMessage(undefined);
  const [selectedAccountResponse, setSelectedAccountResponse] =
    useState<StorageAccountResponse>();
  const [selectedFile, setSelectedFile] = useState<ShadowFileData>();

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCloseStorageForm = () => setStorageFormOpen(false);
  const handleCloseFileUpload = () => setFileUploadOpen(false);
  const handleCloseFileDeletionDialog = useCallback(() => {
    setFileDeletionDialogOpen(false);
  }, [setFileDeletionDialogOpen]);

  const handleCloseAccountDeletionDialog = () =>
    setAccountDeletionDialogOpen(false);
  const {
    deletingAccount,
    isFileUpdating,
    loading,
    cancellingDeleteAccount,
    storageAccounts,
    replaceFile,
    cancelFileDeletion,
    cancelDeleteStorageAccount,
    uploadFiles,
    copyToClipboard,
    createAccount,
    getAccountFiles,
    deleteFile,
    deleteStorageAccount,
  } = useShadowDrive({
    onCopiedToClipboard: () => setSnackbarMessage("Copied to clipboard!"),
    onFileRequestSuccess: (action, identifier) => {
      setSnackbarMessage(
        t(`file-manager-file-${action}-success`, { identifier })
      );

      if (action === "replacing") {
        setReplaceFileDialogOpen(false);
      }
    },
    onFileRequestError: (action, identifier) =>
      setSnackbarMessage(
        t(`file-manager-file-${action}-error`, { identifier })
      ),
    onStorageRequestSuccess: (action, identifier) =>
      setSnackbarMessage(
        t(`file-manager-account-${action}-success`, { identifier })
      ),
    onStorageRequestError: (action, identifier) =>
      setSnackbarMessage(
        t(`file-manager-account-${action}-error`, { identifier })
      ),
  });
  const selectedAccountKey = selectedAccountResponse?.publicKey.toString();
  const selectedAccountFiles = selectedAccountResponse
    ? getAccountFiles(selectedAccountResponse)
    : [];
  const closeMenu =
    (handleMenuSelection: (file: ShadowFileData) => void) => () => {
      handleClose();

      selectedFile && handleMenuSelection(selectedFile);
    };

  const sortedStorageAccounts = useMemo(() => {
    if (!storageAccounts) return;
    return storageAccounts.sort((a, b) =>
      a.account.identifier > b.account.identifier ? 1 : -1
    );
  }, [storageAccounts]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <Box>
        <List sx={{ minWidth: 360, bgcolor: "background.paper" }}>
          {sortedStorageAccounts &&
            sortedStorageAccounts.map((accountResponse) => {
              const { account, publicKey } = accountResponse;
              const accountPublicKeyString = publicKey.toString();
              const files = getAccountFiles(accountResponse);

              return (
                <ListItemButton
                  divider
                  selected={accountPublicKeyString === selectedAccountKey}
                  key={accountPublicKeyString}
                  onClick={() => setSelectedAccountResponse(accountResponse)}
                >
                  <ListItemAvatar>
                    <Avatar>
                      <FolderIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography>
                        {account.identifier}{" "}
                        {files &&
                          `(${files.length} ${
                            files.length === 1 ? "file" : "files"
                          })`}
                      </Typography>
                    }
                    secondary={t("file-manager-account-created", {
                      date: format(
                        new Date(account.creationTime * 1000),
                        "do MMM yyyy"
                      ),
                    })}
                  />
                  <ListItemIcon>
                    <ChevronRight />
                  </ListItemIcon>
                </ListItemButton>
              );
            })}
        </List>
        {!loading && storageAccounts?.length === 0 && (
          <Alert severity="info">
            <AlertTitle>
              {t("file-manager-no-accounts-notification-title")}
            </AlertTitle>
            {t("file-manager-no-accounts-notification-description")}
          </Alert>
        )}
        <Button
          disabled={!wallet?.publicKey}
          onClick={() => setStorageFormOpen(true)}
        >
          {t("file-manager-add-storage-btn")}
        </Button>
      </Box>

      <Box padding={2} sx={{ bgcolor: "#333" }}>
        {selectedAccountResponse?.account.toBeDeleted && (
          <Alert
            severity="warning"
            action={
              <Button
                disabled={cancellingDeleteAccount}
                onClick={() => {
                  cancelDeleteStorageAccount(selectedAccountResponse);
                }}
                size="small"
              >
                {t("file-manager-undo-delete-storage-btn")}
                {cancellingDeleteAccount && <CircularProgress size="16px" />}
              </Button>
            }
          >
            <AlertTitle>
              {t("file-manager-account-deletion-notification-title")}
            </AlertTitle>
            {t("file-manager-account-deletion-notification-description")}
          </Alert>
        )}
        <List
          sx={{ width: "100%", bgcolor: "transparent" }}
          style={{
            opacity: selectedAccountResponse?.account.toBeDeleted ? 0.5 : 1,
          }}
        >
          {selectedAccountResponse && (
            <ListSubheader sx={{ bgcolor: "transparent" }}>
              {t("file-manager-account-capacity", {
                availableSpace: formatBytes(
                  +selectedAccountResponse.account.storageAvailable.toString()
                ),
                totalSpace: formatBytes(
                  +selectedAccountResponse.account.storage.toString()
                ),
              })}
              {selectedAccountResponse.account.immutable ? (
                <LockIcon />
              ) : (
                <LockOpenIcon />
              )}
            </ListSubheader>
          )}
          {selectedAccountResponse &&
            selectedAccountFiles &&
            selectedAccountFiles.map((fileData) => {
              const fileAccount = fileData.account;
              const storageAccount = selectedAccountResponse.account;
              const updating = isFileUpdating(fileAccount);
              return (
                <ListItem
                  key={fileAccount.name}
                  secondaryAction={
                    <IconButton
                      disabled={storageAccount.toBeDeleted || updating}
                      id="file-menu-button"
                      aria-controls={menuOpen ? "file-menu" : undefined}
                      aria-haspopup="true"
                      aria-expanded={menuOpen ? "true" : undefined}
                      onClick={(e) => {
                        setSelectedFile(fileData);
                        handleOpenMenu(e);
                      }}
                    >
                      {updating ? <CircularProgress size={16} /> : <MenuIcon />}
                    </IconButton>
                  }
                >
                  <ListItemAvatar>
                    <Avatar>
                      {/(png|jpg|gif)$/i.test(fileAccount.name) ? (
                        <img
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center center",
                          }}
                          src={getShadowDriveFileUrl(
                            selectedAccountKey as string,
                            fileAccount.name
                          )}
                        />
                      ) : (
                        <FolderIcon />
                      )}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${fileAccount.name} (${formatBytes(
                      fileAccount.size
                    )})`}
                  />
                </ListItem>
              );
            })}
        </List>

        {selectedAccountResponse && (
          <Box>
            <Button
              disabled={
                selectedAccountResponse.account.immutable ||
                selectedAccountResponse.account.toBeDeleted
              }
              onClick={() => setFileUploadOpen(true)}
            >
              {t("file-manager-upload-btn")}
            </Button>
            <Button
              disabled={
                selectedAccountResponse.account.immutable ||
                selectedAccountResponse.account.toBeDeleted
              }
              onClick={() => setAccountDeletionDialogOpen(true)}
            >
              {t("file-manager-delete-account-btn")}
            </Button>
          </Box>
        )}
      </Box>

      <Dialog
        aria-labelledby="add-storage-dialog-title"
        aria-describedby="add-storage-dialog-description"
        open={storageFormOpen}
        onClose={handleCloseStorageForm}
      >
        <DialogTitle id="add-storage-dialog-title">
          {t("add-storage-dialog-title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="add-storage-dialog-description">
            {t("add-storage-dialog-description")}
          </DialogContentText>
          <StorageAccountForm onSubmit={createAccount} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseStorageForm}>
            {t("add-storage-dialog-cancel-btn")}
          </Button>
          <Button form="storage-account-form" type="submit">
            {t("add-storage-dialog-confirm-btn")}
          </Button>
        </DialogActions>
      </Dialog>

      {selectedFile && (
        <Dialog
          open={fileDeletionDialogOpen}
          onClose={handleCloseFileDeletionDialog}
          aria-labelledby="delete-file-dialog-title"
          aria-describedby="delete-file-dialog-description"
        >
          <DialogTitle id="delete-file-dialog-title">
            {t("delete-file-dialog-title")}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="delete-file-dialog-description">
              {t("delete-file-dialog-description", {
                fileName: selectedFile.account.name,
              })}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseFileDeletionDialog}>
              {t("delete-file-dialog-cancel-btn")}
            </Button>
            <Button
              onClick={() => {
                deleteFile(selectedFile);
                handleCloseFileDeletionDialog();
              }}
              autoFocus
            >
              {t("delete-file-dialog-confirm-btn")}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {selectedAccountResponse && (
        <Dialog
          open={accountDeletionDialogOpen}
          onClose={handleCloseAccountDeletionDialog}
          aria-labelledby="delete-account-dialog-title"
          aria-describedby="delete-account-dialog-description"
        >
          <DialogTitle id="delete-account-dialog-title">
            {t("delete-account-dialog-title")}
          </DialogTitle>
          <DialogContent>
            {deletingAccount && (
              <Box mb={2}>
                <CircularProgress />
              </Box>
            )}
            <DialogContentText id="delete-acount-dialog-description">
              {t(
                `delete-account-dialog-description${
                  deletingAccount ? "-deleting" : ""
                }`
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseAccountDeletionDialog}>
              {t("delete-account-dialog-cancel-btn")}
            </Button>
            <Button
              disabled={deletingAccount}
              onClick={async () => {
                try {
                  await deleteStorageAccount(selectedAccountResponse);
                } finally {
                  handleCloseAccountDeletionDialog();
                }
              }}
              autoFocus
            >
              {t("delete-account-dialog-confirm-btn")}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {selectedFile && (
        <Menu
          id="file-menu"
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleClose}
          MenuListProps={{
            "aria-labelledby": "file-menu-button",
          }}
        >
          <MenuItem onClick={closeMenu(copyToClipboard)}>
            {t("file-menu-clipboard")}
          </MenuItem>
          <MenuItem
            disabled={
              selectedFile.account.immutable || selectedFile.account.toBeDeleted
            }
            onClick={closeMenu(() => setReplaceFileDialogOpen(true))}
          >
            {t("file-menu-replace")}
          </MenuItem>
          {selectedFile.account.toBeDeleted ? (
            <MenuItem
              disabled={selectedFile?.account.immutable}
              onClick={closeMenu(cancelFileDeletion)}
            >
              {t("file-menu-cancel-delete")}
            </MenuItem>
          ) : (
            <MenuItem
              disabled={selectedFile?.account.immutable}
              onClick={closeMenu(() => setFileDeletionDialogOpen(true))}
            >
              {t("file-menu-delete")}
            </MenuItem>
          )}
        </Menu>
      )}

      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={6000}
        onClose={handleSnackbardClose}
      >
        <Alert onClose={handleSnackbardClose} severity="success">
          {snackbarMessage}
        </Alert>
      </Snackbar>
      {selectedAccountResponse && (
        <FileUploadForm
          id="file-upload-dialog"
          title={t("file-upload-form-upload-title")}
          onSubmit={(files) => uploadFiles(selectedAccountResponse, files)}
          open={!!selectedAccountKey && fileUploadOpen}
          onClose={handleCloseFileUpload}
        >
          {t("file-upload-form-upload-text")}
        </FileUploadForm>
      )}

      {selectedFile && (
        <FileUploadForm
          id="replace-file-dialog"
          title={t("file-upload-form-replace-title")}
          maxFiles={1}
          onSubmit={(files) => replaceFile(selectedFile, files[0])}
          open={!!selectedFile && replaceFileDialogOpen}
          onClose={() => setReplaceFileDialogOpen(false)}
        >
          {t("file-upload-form-replace-text", {
            fileName: selectedFile.account.name,
          })}
        </FileUploadForm>
      )}
    </div>
  );
};
