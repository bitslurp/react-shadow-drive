import { ChevronRight } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import FileIcon from "@mui/icons-material/FilePresent";
import FolderIcon from "@mui/icons-material/Folder";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import MenuIcon from "@mui/icons-material/MoreVert";
import UploadIcon from "@mui/icons-material/UploadFile";
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
  Fab,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import "@project-serum/anchor";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
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
  StorageAccountInfo,
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
  const [snackbarErrorMessage, setSnackbarErrorMessage] = useState<string>();
  const [replaceFileDialogOpen, setReplaceFileDialogOpen] = useState(false);
  const [selectedAccountKey, setSelectedAccountKey] = useState<PublicKey>();
  const [selectedFile, setSelectedFile] = useState<ShadowFileData>();
  const [selectedFileTab, setSelectedFileTab] = useState<
    "files" | "deleted-files"
  >("files");

  const handleSnackbarClose = () => setSnackbarMessage(undefined);
  const handleSnackbarErrorClose = () => setSnackbarErrorMessage(undefined);
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
    isFileActionPending,
    isStorageActionPending,
    pendingStorageAccounts,
    loading,
    storageAccounts,
    refreshStorageAccountFiles,
    replaceFile,
    refreshStorageAccount,
    cancelFileDeletion,
    cancelDeleteStorageAccount,
    uploadFiles,
    copyToClipboard,
    createStorageAccount,
    getStorageAccountFiles,
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
      setSnackbarErrorMessage(
        t(`file-manager-file-${action}-error`, { identifier })
      ),
    onStorageRequestSuccess: (action, identifier) =>
      setSnackbarMessage(
        t(`file-manager-account-${action}-success`, { identifier })
      ),
    onStorageRequestError: (action, identifier) =>
      setSnackbarErrorMessage(
        t(`file-manager-account-${action}-error`, { identifier })
      ),
  });

  const selectedAccountResponse = selectedAccountKey
    ? storageAccounts?.find((account) =>
        account.publicKey.equals(selectedAccountKey)
      )
    : storageAccounts?.[0];
  const selectedAccountKeyString =
    selectedAccountResponse?.publicKey.toString();

  const [selectedAccountFiles, selectedAccountDeletedFiles] =
    selectedAccountResponse
      ? getStorageAccountFiles(selectedAccountResponse).reduce<
          [ShadowFileData[], ShadowFileData[]]
        >(
          (acc, file) => {
            if (file.account.toBeDeleted) {
              return [acc[0], acc[1].concat(file)];
            }
            return [acc[0].concat(file), acc[1]];
          },
          [[], []]
        )
      : [[], []];
  const closeMenu =
    (handleMenuSelection: (file: ShadowFileData) => void) => () => {
      handleClose();

      selectedFile && handleMenuSelection(selectedFile);
    };

  const sortedStorageAccounts = useMemo(() => {
    if (!storageAccounts) return;
    return storageAccounts.sort((a, b) =>
      a.account.creationTime < b.account.creationTime ? 1 : -1
    );
  }, [storageAccounts]);

  const { deletingSelectedAccount, pollingSelectedAccount } = useMemo(() => {
    if (!selectedAccountResponse) return {};

    return {
      pollingSelectedAccount: isStorageActionPending(
        selectedAccountResponse,
        "polling"
      ),
      deletingSelectedAccount: isStorageActionPending(
        selectedAccountResponse,
        "deleting"
      ),
    };
  }, [selectedAccountResponse, isStorageActionPending]);

  const handleCreateAccount = useCallback(
    (data: StorageAccountInfo) => {
      createStorageAccount(data);
      handleCloseStorageForm();
    },
    [createStorageAccount, handleCloseStorageForm]
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.5fr 2fr" }}>
      <Box>
        {!loading && storageAccounts?.length === 0 && (
          <Box paddingTop={2}>
            <Alert severity="info">
              <AlertTitle>
                {t("file-manager-no-accounts-notification-title")}
              </AlertTitle>
              {t("file-manager-no-accounts-notification-message")}
            </Alert>
          </Box>
        )}
        <Box padding={2} paddingBottom={1}>
          <Button
            disabled={!wallet?.publicKey}
            onClick={() => setStorageFormOpen(true)}
          >
            {t("file-manager-add-storage-btn")}
          </Button>
        </Box>
        <List sx={{ minWidth: 360, bgcolor: "background.paper" }}>
          {Object.values(pendingStorageAccounts).map(({ accountName }) => (
            <ListItem style={{ opacity: 0.6 }} key={accountName}>
              <ListItemAvatar>
                <Avatar>
                  <CircularProgress />
                </Avatar>
              </ListItemAvatar>

              <ListItemText
                primary={
                  <Typography>
                    {t("file-manager-account-adding-storage", { accountName })}
                  </Typography>
                }
              />
            </ListItem>
          ))}
          {sortedStorageAccounts &&
            sortedStorageAccounts.map((accountResponse) => {
              const { account, publicKey } = accountResponse;
              const accountPublicKeyString = publicKey.toString();
              const files = getStorageAccountFiles(accountResponse);

              return (
                <ListItemButton
                  divider
                  selected={accountPublicKeyString === selectedAccountKeyString}
                  key={accountPublicKeyString}
                  onClick={() => {
                    refreshStorageAccountFiles(accountResponse);
                    refreshStorageAccount(accountResponse);
                    setSelectedAccountKey(accountResponse.publicKey);
                    setSelectedFileTab("files");
                  }}
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
      </Box>
      <Box sx={{ bgcolor: "#333" }}>
        {pollingSelectedAccount && (
          <LinearProgress aria-describedby="pollingAlert" />
        )}
        <Box padding={2} paddingBottom={10}>
          {selectedAccountResponse && (
            <Box style={{ display: "flex" }} marginBottom={2}>
              <div style={{ flex: 1 }}>
                <Typography variant="h5">
                  <span style={{ marginRight: "8px" }}>
                    {selectedAccountResponse.account.identifier}
                  </span>
                  {selectedAccountResponse.account.immutable ? (
                    <Tooltip
                      title={t("file-manager-account-immutable-tooltip")}
                    >
                      <LockIcon aria-labe fontSize="small" />
                    </Tooltip>
                  ) : (
                    <Tooltip title={t("file-manager-account-mutable-tooltip")}>
                      <LockOpenIcon fontSize="small" />
                    </Tooltip>
                  )}
                </Typography>
                <Typography variant="subtitle2">
                  {selectedAccountKeyString}
                </Typography>
                <Box marginTop={1}>
                  <Typography fontSize={12}>
                    {t("file-manager-account-capacity", {
                      availableSpace: formatBytes(
                        +selectedAccountResponse.account.storageAvailable.toString()
                      ),
                      totalSpace: formatBytes(
                        +selectedAccountResponse.account.storage.toString()
                      ),
                    })}
                  </Typography>
                </Box>
              </div>
              <Box>
                <IconButton
                  disabled={
                    selectedAccountResponse.account.immutable ||
                    selectedAccountResponse.account.toBeDeleted
                  }
                  onClick={() => setAccountDeletionDialogOpen(true)}
                  aria-label={t("file-manager-delete-account-btn")}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
          )}

          {selectedAccountResponse && (
            <Fab
              style={{ position: "fixed", bottom: "32px", right: "32px" }}
              disabled={
                selectedAccountResponse.account.immutable ||
                selectedAccountResponse.account.toBeDeleted
              }
              color="primary"
              onClick={() => setFileUploadOpen(true)}
              aria-label={t("file-manager-upload-btn")}
            >
              <UploadIcon />
            </Fab>
          )}
          {pollingSelectedAccount && (
            <Box marginBottom={2}>
              <Alert severity="info" id="pollingAlert">
                <AlertTitle>
                  {t("file-manager-account-polling-notification-title")}
                </AlertTitle>
                {t("file-manager-account-polling-notification-message")}
              </Alert>
            </Box>
          )}
          {selectedAccountResponse?.account.toBeDeleted && (
            <Box marginBottom={2}>
              <Alert
                severity="warning"
                action={
                  <Button
                    disabled={isStorageActionPending(selectedAccountResponse)}
                    onClick={() => {
                      cancelDeleteStorageAccount(selectedAccountResponse);
                    }}
                    size="small"
                  >
                    {t("file-manager-undo-delete-storage-btn")}
                    {isStorageActionPending(
                      selectedAccountResponse,
                      "cancellingDeletion"
                    ) && <CircularProgress size="16px" />}
                  </Button>
                }
              >
                <AlertTitle>
                  {t("file-manager-account-deletion-notification-title")}
                </AlertTitle>
                {t("file-manager-account-deletion-notification-message")}
              </Alert>
            </Box>
          )}
          {selectedAccountResponse && (
            <>
              <Tabs
                value={selectedFileTab}
                onChange={(e, value) => setSelectedFileTab(value)}
              >
                <Tab
                  label={
                    t("file-manager-account-files-tab") +
                    ` (${selectedAccountFiles?.length || 0})`
                  }
                  value="files"
                />
                <Tab
                  label={
                    t("file-manager-account-deleted-files-tab") +
                    ` (${selectedAccountDeletedFiles?.length || 0})`
                  }
                  value="deleted-files"
                />
              </Tabs>
              <TabPanel selected={selectedFileTab} value="files">
                {!selectedAccountFiles?.length && (
                  <Typography>
                    {t("file-manager-account-files-empty")}
                  </Typography>
                )}
                <List
                  sx={{ width: "100%", bgcolor: "transparent" }}
                  style={{
                    opacity: selectedAccountResponse?.account.toBeDeleted
                      ? 0.5
                      : 1,
                  }}
                >
                  {selectedAccountResponse &&
                    selectedAccountFiles &&
                    selectedAccountFiles.map((fileData) => {
                      const fileAccount = fileData.account;
                      const storageAccount = selectedAccountResponse.account;
                      const updating = isFileActionPending(fileAccount);
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
                              {updating ? (
                                <CircularProgress size={16} />
                              ) : (
                                <MenuIcon />
                              )}
                            </IconButton>
                          }
                        >
                          <ListItemAvatar>
                            <Avatar>
                              {/(png|jpg|gif|jpeg)$/i.test(fileAccount.name) ? (
                                <img
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    objectPosition: "center center",
                                  }}
                                  src={getShadowDriveFileUrl(
                                    selectedAccountKeyString as string,
                                    fileAccount.name
                                  )}
                                />
                              ) : (
                                <FileIcon />
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
              </TabPanel>

              <TabPanel selected={selectedFileTab} value="deleted-files">
                {!selectedAccountDeletedFiles?.length && (
                  <Typography>
                    {t("file-manager-account-deleted-files-empty")}
                  </Typography>
                )}
                <List
                  sx={{ width: "100%", bgcolor: "transparent" }}
                  style={{
                    opacity: selectedAccountResponse?.account.toBeDeleted
                      ? 0.5
                      : 1,
                  }}
                >
                  {selectedAccountResponse &&
                    selectedAccountDeletedFiles &&
                    selectedAccountDeletedFiles.map((fileData) => {
                      const fileAccount = fileData.account;
                      const storageAccount = selectedAccountResponse.account;
                      const updating = isFileActionPending(fileAccount);
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
                              {updating ? (
                                <CircularProgress size={16} />
                              ) : (
                                <MenuIcon />
                              )}
                            </IconButton>
                          }
                        >
                          <ListItemAvatar>
                            <Avatar>
                              {/(png|jpg|gif|jpeg)$/i.test(fileAccount.name) ? (
                                <img
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    objectPosition: "center center",
                                  }}
                                  src={getShadowDriveFileUrl(
                                    selectedAccountKeyString as string,
                                    fileAccount.name
                                  )}
                                />
                              ) : (
                                <FileIcon />
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
              </TabPanel>
            </>
          )}
        </Box>
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
          <StorageAccountForm onSubmit={handleCreateAccount} />
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
            {deletingSelectedAccount && (
              <Box mb={2}>
                <CircularProgress />
              </Box>
            )}
            <DialogContentText id="delete-acount-dialog-description">
              {t(
                `delete-account-dialog-description${
                  deletingSelectedAccount ? "-deleting" : ""
                }`
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseAccountDeletionDialog}>
              {t("delete-account-dialog-cancel-btn")}
            </Button>
            <Button
              disabled={deletingSelectedAccount}
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
        onClose={handleSnackbarClose}
      >
        <Alert onClose={handleSnackbarClose} severity="success">
          {snackbarMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!snackbarErrorMessage}
        autoHideDuration={6000}
        onClose={handleSnackbarErrorClose}
      >
        <Alert onClose={handleSnackbarErrorClose} severity="error">
          {snackbarErrorMessage}
        </Alert>
      </Snackbar>
      {selectedAccountResponse && (
        <FileUploadForm
          id="file-upload-dialog"
          title={t("file-upload-form-upload-title")}
          onSubmit={async (files) => {
            await uploadFiles(selectedAccountResponse, files);
            handleCloseFileUpload();
          }}
          open={fileUploadOpen}
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

interface TabPanelProps {
  children?: React.ReactNode;
  selected: string;
  value: string;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, selected, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== selected}
      id={`simple-tabpanel-${value}`}
      aria-labelledby={`simple-tab-${value}`}
      {...other}
    >
      {value === selected && (
        <Box sx={{ paddingY: 2, paddingX: 1 }}>{children}</Box>
      )}
    </div>
  );
}
