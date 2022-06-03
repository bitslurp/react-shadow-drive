import { ChevronRight } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import ImageIcon from "@mui/icons-material/Image";
import MenuIcon from "@mui/icons-material/MoreVert";
import {
  Alert,
  Avatar,
  Box,
  Button,
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
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import format from "date-fns/format";
import React, {
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useState,
} from "react";
import { formatBytes, useShadowDrive } from "react-shadow-drive";
import { FileUploadForm } from "../FileUploadForm/FileUploadForm";
import { StorageAccountForm } from "../StorageAccountForm/StorageAccountForm";

export const ShadowDriveFileManager: FunctionComponent<
  PropsWithChildren<{}>
> = () => {
  const wallet = useAnchorWallet();
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [storageFormOpen, setStorageFormOpen] = useState(false);
  const [fileUploadOpen, setFileUploadOpen] = useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [snackbarMessage, setSnackbarMessage] = useState<string>();
  const [replaceFileDialogOpen, setReplaceFileDialogOpen] = useState(false);
  const handleSnackbardClose = () => setSnackbarMessage(undefined);
  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleCloseStorageForm = () => setStorageFormOpen(false);
  const handleCloseFileUpload = () => setFileUploadOpen(false);
  const handleCloseDeletionDialog = useCallback(() => {
    setDeletionDialogOpen(false);
  }, [setDeletionDialogOpen]);
  const {
    selectedAccountResponse,
    selectedAccountKey,
    selectedAccountFiles,
    selectedFile,
    replaceFile,
    storageAccounts,
    filesByKey,
    uploadFiles,
    copyToClipboard,
    createAccount,
    deleteSelectedFile,
    setSelectedAccountResponse,
    setSelectedFile,
  } = useShadowDrive({
    onCopiedToClipboard: () => setSnackbarMessage("Copied to clipboard!"),
    onFileDeleted: () => setSnackbarMessage("File marked for deletion"),
    onStorageAccountCreated: () => setSnackbarMessage("New account created"),
    onFilesUploaded() {
      setSnackbarMessage("Files uploaded successfully");
      handleCloseFileUpload();
    },
    onFileReplaced() {
      setSnackbarMessage(`${selectedFile?.account.name} replaced`);
      setReplaceFileDialogOpen(false);
    },
  });
  const closeMenu = (handleMenuSelection: () => void) => () => {
    handleClose();
    handleMenuSelection();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <Box>
        <List sx={{ minWidth: 360, bgcolor: "background.paper" }}>
          {storageAccounts &&
            storageAccounts.map((accountResponse) => {
              const { account, publicKey } = accountResponse;
              const accountPublicKeyString = publicKey.toString();
              const files = filesByKey[accountPublicKeyString];

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
                    secondary={`Created: ${format(
                      new Date(account.creationTime * 1000),
                      "do MMM yyyy"
                    )}`}
                  />
                  <ListItemIcon>
                    <ChevronRight />
                  </ListItemIcon>
                </ListItemButton>
              );
            })}
        </List>

        <Button
          disabled={!wallet?.publicKey}
          onClick={() => setStorageFormOpen(true)}
        >
          Add Storage
        </Button>
      </Box>

      <Box padding={2} sx={{ bgcolor: "#333" }}>
        <List sx={{ width: "100%", bgcolor: "transparent" }}>
          {selectedAccountResponse && (
            <ListSubheader sx={{ bgcolor: "transparent" }}>
              {`${formatBytes(
                +selectedAccountResponse.account.storageAvailable.toString()
              )} of ${formatBytes(
                +selectedAccountResponse.account.storage.toString()
              )} remaining`}
            </ListSubheader>
          )}
          {selectedAccountFiles &&
            selectedAccountFiles.map((fileData) => {
              const file = fileData.account;
              return (
                <ListItem
                  key={file.name}
                  secondaryAction={
                    <IconButton
                      id="file-menu-button"
                      aria-controls={menuOpen ? "file-menu" : undefined}
                      aria-haspopup="true"
                      aria-expanded={menuOpen ? "true" : undefined}
                      onClick={(e) => {
                        setSelectedFile(fileData);
                        handleOpenMenu(e);
                      }}
                    >
                      <MenuIcon />
                    </IconButton>
                  }
                >
                  <ListItemAvatar>
                    <Avatar>
                      {/(png|jpg|gif)$/i.test(file.name) ? (
                        <ImageIcon />
                      ) : (
                        <FolderIcon />
                      )}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${file.name} (${formatBytes(file.size)})`}
                  />
                </ListItem>
              );
            })}
        </List>

        {selectedAccountKey && (
          <Button onClick={() => setFileUploadOpen(true)}>Upload Files</Button>
        )}
      </Box>

      <Dialog open={storageFormOpen} onClose={handleCloseStorageForm}>
        <DialogTitle>Add Storage</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter configuration for your new storage folder.
          </DialogContentText>
          <StorageAccountForm onSubmit={createAccount} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseStorageForm}>Cancel</Button>
          <Button form="storage-account-form" type="submit">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deletionDialogOpen}
        onClose={handleCloseDeletionDialog}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete File</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeletionDialog}>Cancel</Button>
          <Button onClick={deleteSelectedFile} autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

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
          Copy to clipboard
        </MenuItem>
        <MenuItem
          disabled={selectedFile?.account.immutable}
          onClick={closeMenu(() => setReplaceFileDialogOpen(true))}
        >
          Replace
        </MenuItem>
        <MenuItem
          disabled={selectedFile?.account.immutable}
          onClick={closeMenu(() => setDeletionDialogOpen(true))}
        >
          Delete
        </MenuItem>
      </Menu>

      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={6000}
        onClose={handleSnackbardClose}
      >
        <Alert onClose={handleSnackbardClose} severity="success">
          {snackbarMessage}
        </Alert>
      </Snackbar>

      <FileUploadForm
        id="file-upload-dialog"
        title="Upload Files"
        onSubmit={uploadFiles}
        open={!!selectedAccountKey && fileUploadOpen}
        onClose={handleCloseFileUpload}
      >
        Uplod your files. Currently limited to 5 max.
      </FileUploadForm>

      <FileUploadForm
        id="replace-file-dialog"
        title="Replace File"
        maxFiles={1}
        onSubmit={(files) => replaceFile(files[0])}
        open={!!selectedFile && replaceFileDialogOpen}
        onClose={() => setReplaceFileDialogOpen(false)}
      >
        Replace {selectedFile?.account.name}
      </FileUploadForm>
    </div>
  );
};
