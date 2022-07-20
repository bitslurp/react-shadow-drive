import { ChevronRight } from "@mui/icons-material";
import DeleteIcon from "@mui/icons-material/Delete";
import FileIcon from "@mui/icons-material/FilePresent";
import FolderIcon from "@mui/icons-material/Folder";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import MenuIcon from "@mui/icons-material/Menu";
import VertMenuIcon from "@mui/icons-material/MoreVert";
import UploadIcon from "@mui/icons-material/UploadFile";
import {
  Alert,
  AlertTitle,
  AppBar,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
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
  Skeleton,
  Snackbar,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import format from "date-fns/format";
import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  formatBytes,
  getShadowDriveFileUrl,
  ShadowFileData,
  StorageAccountData,
  useShadowDrive,
} from "react-shadow-drive";
import { FileUploadForm } from "../FileUploadForm/FileUploadForm";
import { StorageAccountForm } from "../StorageAccountForm/StorageAccountForm";

const DialogSpinner = () => (
  <Box marginY={2} display="flex" justifyContent="center">
    <CircularProgress />
  </Box>
);

const drawerWidth = 400;

const StorageSkeleton = () => {
  const [primaryWidth] = useState(100 + Math.ceil(Math.random() * 70));
  const [secondaryWidth] = useState(210 + Math.ceil(Math.random() * 40));

  return (
    <ListItem>
      <ListItemAvatar>
        <Skeleton variant="circular" width={40} height={40} />
      </ListItemAvatar>

      <ListItemText
        primary={<Skeleton variant="text" width={primaryWidth} />}
        secondary={<Skeleton variant="text" width={secondaryWidth} />}
      />
    </ListItem>
  );
};

const FileSkeleton = () => {
  const [primaryWidth] = useState(100 + Math.ceil(Math.random() * 120));
  return (
    <ListItem>
      <ListItemAvatar>
        <Skeleton variant="circular" width={40} height={40} />
      </ListItemAvatar>

      <ListItemText
        primary={<Skeleton variant="text" width={primaryWidth} />}
      />
    </ListItem>
  );
};

export const ShadowDriveFileManager: FunctionComponent<
  PropsWithChildren<{}>
> = () => {
  const { t } = useTranslation();
  const wallet = useWallet();

  const [fileDeletionDialogOpen, setFileDeletionDialogOpen] = useState(false);
  const [accountDeletionDialogOpen, setAccountDeletionDialogOpen] =
    useState(false);
  const [storageFormOpen, setStorageFormOpen] = useState(false);
  const [reduceStorageFormOpen, setReduceStorageFormOpen] = useState(false);
  const [displayMobileMenu, setDisplayMobileMenu] = useState(false);
  const [fileUploadOpen, setFileUploadOpen] = useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [snackbarMessage, setSnackbarMessage] = useState<string>();
  const [snackbarErrorMessage, setSnackbarErrorMessage] = useState<string>();
  const [replaceFileDialogOpen, setReplaceFileDialogOpen] = useState(false);
  const [immutableStorageDialogOpen, setImmutableStorageDialogOpen] =
    useState(false);
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
  const handleCloseReduceStorageForm = () => setReduceStorageFormOpen(false);
  const handleCloseFileUpload = () => setFileUploadOpen(false);
  const handleCloseImmutableStorageDialog = () =>
    setImmutableStorageDialogOpen(false);
  const handleCloseFileDeletionDialog = useCallback(() => {
    setFileDeletionDialogOpen(false);
  }, [setFileDeletionDialogOpen]);

  const handleCloseAccountDeletionDialog = () =>
    setAccountDeletionDialogOpen(false);
  const {
    ready,
    isFileActionPending,
    isStorageActionPending,
    pendingStorageAccounts,
    loading,
    loadingAccounts,
    storageAccounts,
    fetchFile,
    reduceStorage,
    makeStorageAccountImmutable,
    refreshStorageAccounts,
    refreshStorageAccountFiles,
    replaceFile,
    refreshStorageAccount,
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

  useEffect(() => {
    if (!ready) return;

    refreshStorageAccounts();
  }, [ready]);

  const selectedAccountInfo =
    selectedAccountKey &&
    storageAccounts?.find((account) =>
      account.storage_account.equals(selectedAccountKey)
    );

  const selectedAccountKeyString =
    selectedAccountInfo?.storage_account.toString();

  const selectedAccountFiles = selectedAccountInfo
    ? getStorageAccountFiles(selectedAccountInfo)
    : [];
  const closeMenu =
    (handleMenuSelection: (file: ShadowFileData) => void) => () => {
      handleClose();

      selectedFile && handleMenuSelection(selectedFile);
    };

  const sortedStorageAccounts = useMemo(() => {
    if (!storageAccounts) return;
    return storageAccounts.sort((a, b) =>
      a.creation_time < b.creation_time ? 1 : -1
    );
  }, [storageAccounts]);

  const {
    deletingSelectedAccount,
    fetchingFiles,
    pollingSelectedAccount,
    reducingSizeOfSelectedAccount,
  } = useMemo(() => {
    if (!selectedAccountInfo) return {};

    return {
      reducingSizeOfSelectedAccount: isStorageActionPending(
        selectedAccountInfo,
        "reducingSize"
      ),
      fetchingFiles: isStorageActionPending(
        selectedAccountInfo,
        "fetchingFiles"
      ),
      pollingSelectedAccount: isStorageActionPending(
        selectedAccountInfo,
        "polling"
      ),
      deletingSelectedAccount: isStorageActionPending(
        selectedAccountInfo,
        "deleting"
      ),
    };
  }, [selectedAccountInfo, isStorageActionPending]);

  const handleCreateAccount = (data: StorageAccountData) => {
    createStorageAccount(data);
    handleCloseStorageForm();
  };

  const handleReduceStorage = async (data: StorageAccountData) => {
    if (selectedAccountInfo) {
      await reduceStorage(selectedAccountInfo, data);
      handleCloseReduceStorageForm();
    }
  };

  const handleFetchFile = async (fileData: ShadowFileData) => {
    const file = await fetchFile(fileData);

    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(file);
    a.download = file.name;
    a.click();
  };

  const drawer = (
    <Box style={{ flex: 1 }} sx={{ bgcolor: "background.paper" }}>
      <Box padding={2} paddingBottom={1}>
        <Button
          variant="contained"
          disabled={!wallet?.publicKey}
          onClick={() => setStorageFormOpen(true)}
        >
          {t("file-manager-add-storage-btn")}
        </Button>
      </Box>

      <List sx={{ minWidth: 360, bgcolor: "background.paper" }}>
        {loadingAccounts && (
          <>
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
            <StorageSkeleton />
          </>
        )}
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
          sortedStorageAccounts.map((account) => {
            const { storage_account: publicKey } = account;
            const accountPublicKeyString = publicKey.toString();

            return (
              <ListItemButton
                divider
                selected={accountPublicKeyString === selectedAccountKeyString}
                key={accountPublicKeyString}
                onClick={() => {
                  setDisplayMobileMenu(false);
                  refreshStorageAccountFiles(account);
                  refreshStorageAccount(account);
                  setSelectedAccountKey(publicKey);
                  setSelectedFileTab("files");
                }}
              >
                <ListItemAvatar>
                  <Avatar>
                    {account.immutable ? <LockIcon /> : <FolderIcon />}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography>
                      {account.identifier}{" "}
                      {`(${formatBytes(
                        +(account.reserved_bytes || 0).toString()
                      )})`}
                    </Typography>
                  }
                  secondary={t("file-manager-account-created", {
                    date: format(
                      new Date(account.creation_time * 1000),
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
  );
  return (
    <Box sx={{ display: "flex" }}>
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { xs: 0 } }}
        aria-label={t("file-manager-storage-list")}
      >
        <Drawer
          variant="temporary"
          open={displayMobileMenu}
          onClose={() => setDisplayMobileMenu(false)}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: "block", sm: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              height: "100vh",
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="persistent"
          sx={{
            display: { xs: "none", sm: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { m: `calc(100% - ${drawerWidth}px)` },
          bgcolor: "#333",
          height: "100vh",
          overflow: "auto",
        }}
      >
        <AppBar
          sx={{
            p: 2,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
          position="sticky"
        >
          <IconButton
            aria-label={t("file-manager-menu-button")}
            size="large"
            edge="start"
            color="inherit"
            sx={{ mr: 2, display: { xs: "block", sm: "block", md: "none" } }}
            onClick={() => setDisplayMobileMenu(true)}
          >
            <MenuIcon />
          </IconButton>
          <Box flexGrow={1}>
            <h1 style={{ margin: 0 }} className="bit-font">
              {t("file-manager-title")}
            </h1>
          </Box>
          <WalletMultiButton />
        </AppBar>
        {pollingSelectedAccount && (
          <LinearProgress aria-describedby="pollingAlert" />
        )}
        <Box padding={2} paddingBottom={10}>
          {wallet?.publicKey && !loading && storageAccounts?.length === 0 && (
            <Box paddingTop={2}>
              <Alert severity="info">
                <AlertTitle>
                  {t("file-manager-no-accounts-notification-title")}
                </AlertTitle>
                {t("file-manager-no-accounts-notification-message")}
              </Alert>
            </Box>
          )}

          {!wallet?.publicKey && (
            <>
              <Typography mb={2} variant="h4">
                {t("file-manager-connect-wallet-title")}
              </Typography>

              <Typography>{t("file-manager-connect-wallet-intro")}</Typography>
            </>
          )}

          {storageAccounts &&
            storageAccounts.length > 0 &&
            !selectedAccountInfo && (
              <>
                <Typography>
                  {t("file-manager-select-storage-account")}
                </Typography>
              </>
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

          {selectedAccountInfo && (
            <Box style={{ display: "flex" }} marginBottom={2}>
              <div style={{ flex: 1 }}>
                <Typography variant="h5">
                  <span style={{ marginRight: "8px" }}>
                    {selectedAccountInfo.identifier}
                  </span>
                  {selectedAccountInfo.immutable ? (
                    <Tooltip
                      title={t("file-manager-account-immutable-tooltip")}
                    >
                      <LockIcon fontSize="small" />
                    </Tooltip>
                  ) : (
                    <Tooltip title={t("file-manager-account-mutable-tooltip")}>
                      <IconButton
                        onClick={() => setImmutableStorageDialogOpen(true)}
                      >
                        <LockOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Typography>
                <Typography variant="subtitle2">
                  {selectedAccountKeyString}
                </Typography>
                <Box
                  marginTop={1}
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  <Typography mr={1} fontSize={12}>
                    {t("file-manager-account-capacity", {
                      availableSpace: formatBytes(
                        +(
                          selectedAccountInfo.reserved_bytes -
                          (selectedAccountInfo.current_usage || 0)
                        ).toString()
                      ),
                      totalSpace: formatBytes(
                        +selectedAccountInfo.reserved_bytes.toString()
                      ),
                    })}
                  </Typography>
                  <Button
                    size="small"
                    disabled={selectedAccountInfo.immutable}
                    variant="text"
                    onClick={() => setReduceStorageFormOpen(true)}
                  >
                    {t("file-manager-account-reduce-storage-btn")}
                  </Button>
                </Box>
              </div>
              <Box>
                <Tooltip
                  placement="left"
                  title={t("file-manager-delete-account-btn")}
                >
                  <IconButton
                    disabled={
                      selectedAccountInfo.immutable ||
                      selectedAccountInfo.to_be_deleted
                    }
                    onClick={() => setAccountDeletionDialogOpen(true)}
                    aria-label={t("file-manager-delete-account-btn")}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}

          {selectedAccountInfo && (
            <Tooltip title={t("file-manager-upload-btn")}>
              <Fab
                style={{ position: "fixed", bottom: "32px", right: "32px" }}
                disabled={
                  selectedAccountInfo.immutable ||
                  selectedAccountInfo.to_be_deleted
                }
                color="primary"
                onClick={() => setFileUploadOpen(true)}
                aria-label={t("file-manager-upload-btn")}
              >
                <UploadIcon />
              </Fab>
            </Tooltip>
          )}

          {selectedAccountInfo?.to_be_deleted && (
            <Box marginBottom={2}>
              <Alert
                severity="warning"
                action={
                  <Button
                    disabled={isStorageActionPending(selectedAccountInfo)}
                    onClick={() => {
                      cancelDeleteStorageAccount(selectedAccountInfo);
                    }}
                    size="small"
                  >
                    {t("file-manager-undo-delete-storage-btn")}
                    {isStorageActionPending(
                      selectedAccountInfo,
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
          {selectedAccountInfo && (
            <>
              <Tabs
                value={selectedFileTab}
                onChange={(e, value) => setSelectedFileTab(value)}
              >
                <Tab
                  label={
                    t("file-manager-account-files-tab") +
                    (fetchingFiles && !selectedAccountFiles?.length
                      ? ""
                      : ` (${selectedAccountFiles?.length || 0})`)
                  }
                  value="files"
                />
              </Tabs>
              <TabPanel selected={selectedFileTab} value="files">
                {!fetchingFiles && !selectedAccountFiles?.length && (
                  <Typography>
                    {t("file-manager-account-files-empty")}
                  </Typography>
                )}
                <List
                  sx={{ width: "100%", bgcolor: "transparent" }}
                  style={{
                    opacity: selectedAccountInfo?.to_be_deleted ? 0.5 : 1,
                  }}
                >
                  {fetchingFiles && !selectedAccountFiles?.length && (
                    <>
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                      <FileSkeleton />
                    </>
                  )}
                  {selectedAccountInfo &&
                    selectedAccountFiles &&
                    selectedAccountFiles.map((fileData) => {
                      const storageAccount = selectedAccountInfo;
                      const fileActionPending = isFileActionPending(fileData);
                      return (
                        <ListItem
                          key={fileData.name}
                          secondaryAction={
                            <IconButton
                              disabled={
                                storageAccount.to_be_deleted ||
                                fileActionPending
                              }
                              id="file-menu-button"
                              aria-controls={menuOpen ? "file-menu" : undefined}
                              aria-haspopup="true"
                              aria-expanded={menuOpen ? "true" : undefined}
                              onClick={(e) => {
                                setSelectedFile(fileData);
                                handleOpenMenu(e);
                              }}
                            >
                              {fileActionPending ? (
                                <CircularProgress size={16} />
                              ) : (
                                <VertMenuIcon />
                              )}
                            </IconButton>
                          }
                        >
                          <ListItemAvatar>
                            <Avatar>
                              {/(png|jpg|gif|jpeg)$/i.test(fileData.name) ? (
                                <img
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    objectPosition: "center center",
                                  }}
                                  src={getShadowDriveFileUrl(fileData)}
                                />
                              ) : (
                                <FileIcon />
                              )}
                            </Avatar>
                          </ListItemAvatar>
                          <ListItemText primary={fileData.name} />
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
          <Box mt={2}>
            <StorageAccountForm splTokenSelect onSubmit={handleCreateAccount} />
          </Box>
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
                fileName: selectedFile.name,
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

      {selectedAccountInfo && (
        <>
          <Dialog
            aria-labelledby="reduce-storage-dialog-title"
            aria-describedby="reduce-storage-dialog-description"
            open={reduceStorageFormOpen}
            onClose={handleCloseReduceStorageForm}
          >
            <DialogTitle id="reduce-storage-dialog-title">
              {t("reduce-storage-dialog-title")}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="reduce-storage-dialog-description">
                {!reducingSizeOfSelectedAccount &&
                  t("reduce-storage-dialog-description")}
              </DialogContentText>

              {reducingSizeOfSelectedAccount ? (
                <DialogSpinner />
              ) : (
                <Box mt={2}>
                  <StorageAccountForm
                    spaceOnly
                    onSubmit={handleReduceStorage}
                  />
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                disabled={reducingSizeOfSelectedAccount}
                onClick={handleCloseReduceStorageForm}
              >
                {t("reduce-storage-dialog-cancel-btn")}
              </Button>
              <Button
                disabled={reducingSizeOfSelectedAccount}
                form="storage-account-form"
                type="submit"
              >
                {t("reduce-storage-dialog-confirm-btn")}
              </Button>
            </DialogActions>
          </Dialog>
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
              {deletingSelectedAccount && <DialogSpinner />}
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
                    await deleteStorageAccount(selectedAccountInfo);
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

          <Dialog
            open={immutableStorageDialogOpen}
            onClose={handleCloseImmutableStorageDialog}
            aria-labelledby="immutable-storage-dialog-title"
            aria-describedby="immutable-storage-dialog-description"
          >
            <DialogTitle id="immutable-storage-dialog-title">
              {t("immutable-storage-dialog-title")}
            </DialogTitle>
            <DialogContent>
              <DialogContentText id="immutable-storage-dialog-description">
                {t("immutable-storage-dialog-description")}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseImmutableStorageDialog}>
                {t("immutable-storage-dialog-cancel-btn")}
              </Button>
              <Button
                onClick={() => {
                  handleCloseImmutableStorageDialog();
                  makeStorageAccountImmutable(selectedAccountInfo);
                }}
                autoFocus
              >
                {t("immutable-storage-dialog-confirm-btn")}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {selectedFile && selectedAccountInfo && (
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

          <MenuItem onClick={closeMenu(handleFetchFile)}>
            {t("file-menu-download")}
          </MenuItem>
          <MenuItem
            disabled={
              selectedAccountInfo.immutable || selectedAccountInfo.to_be_deleted
            }
            onClick={closeMenu(() => setReplaceFileDialogOpen(true))}
          >
            {t("file-menu-replace")}
          </MenuItem>

          <MenuItem
            disabled={selectedAccountInfo.immutable}
            onClick={closeMenu(() => setFileDeletionDialogOpen(true))}
          >
            {t("file-menu-delete")}
          </MenuItem>
        </Menu>
      )}

      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        open={!!snackbarMessage}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert onClose={handleSnackbarClose} severity="success">
          {snackbarMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        open={!!snackbarErrorMessage}
        autoHideDuration={6000}
        onClose={handleSnackbarErrorClose}
      >
        <Alert onClose={handleSnackbarErrorClose} severity="error">
          {snackbarErrorMessage}
        </Alert>
      </Snackbar>
      {selectedAccountInfo && (
        <FileUploadForm
          id="file-upload-dialog"
          title={t("file-upload-form-upload-title")}
          encryptCheckbox
          onSubmit={async (files, encrypt) => {
            await uploadFiles(selectedAccountInfo, files, encrypt);
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
            fileName: selectedFile.name,
          })}
        </FileUploadForm>
      )}
    </Box>
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
