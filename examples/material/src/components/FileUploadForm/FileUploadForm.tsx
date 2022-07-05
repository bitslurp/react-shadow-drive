import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  Typography,
} from "@mui/material";
import { Box } from "@mui/system";
import React, {
  FunctionComponent,
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { DropEvent, FileRejection, useDropzone } from "react-dropzone";

const baseStyle = {
  flex: 1,
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px",
  borderWidth: 2,
  borderRadius: 2,
  borderColor: "#eeeeee",
  borderStyle: "dashed",
  backgroundColor: "#fafafa",
  color: "#bdbdbd",
  outline: "none",
  transition: "border .24s ease-in-out",
};

const focusedStyle = {
  borderColor: "#2196f3",
};

const acceptStyle = {
  borderColor: "#00e676",
};

const rejectStyle = {
  borderColor: "#ff1744",
};

const textEncoder = new TextEncoder();
export const FileUploadForm: FunctionComponent<
  PropsWithChildren<{
    id: string;
    maxFiles?: number;
    onSubmit: (files: FileList) => Promise<void>;
    title: string;
    open: boolean;
    onClose: () => void;
  }>
> = ({ children, id, title, maxFiles = 5, open, onClose, onSubmit }) => {
  const [files, setFiles] = useState<FileList>();
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleSnackbardClose = () => setSnackbarOpen(false);

  const ref: MutableRefObject<HTMLInputElement | null> =
    useRef<HTMLInputElement>(null);
  const onDrop = useCallback(
    (
      _acceptedFiles: File[],
      _fileRejections: FileRejection[],
      event: DropEvent
    ) => {
      if (!ref.current?.files?.length) return;

      setFiles(ref.current.files);
    },
    []
  );

  const {
    isFocused,
    isDragAccept,
    isDragReject,
    getRootProps,
    getInputProps,
    isDragActive,
  } = useDropzone({ onDrop, maxFiles });
  const filesDropped = files && files.length;
  const inputProps = getInputProps();
  const [submitting, setSubmitting] = useState(false);

  const style: any = useMemo(
    () => ({
      ...baseStyle,
      ...(isFocused ? focusedStyle : {}),
      ...(isDragAccept ? acceptStyle : {}),
      ...(isDragReject ? rejectStyle : {}),
      backgroundColor: "transparent",
    }),
    [isFocused, isDragAccept, isDragReject]
  );

  const handleSubmit = async () => {
    if (!filesDropped) return;

    try {
      setSubmitting(true);
      await onSubmit(files);
      setFiles(undefined);
    } catch {
      setSnackbarOpen(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFiles(undefined);
    onClose();
  };

  const fileArray = files ? Array.from(files) : [];

  const invalidFileNames = fileArray.some(
    (f) => textEncoder.encode(f.name).length > 32
  );

  return (
    <>
      <Dialog
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        open={open}
        onClose={handleClose}
      >
        <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
        <DialogContent>
          <DialogContentText id={`${id}-description`}>
            {!submitting && children}
          </DialogContentText>

          {submitting ? (
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              sx={{ minWidth: "2000px" }}
            >
              <Box marginBottom={2}>Uploading...</Box>

              <CircularProgress />
            </Box>
          ) : (
            !files?.length && (
              <Box marginY={4} style={{ textAlign: "center" }}>
                <div {...getRootProps({ style })}>
                  <input
                    {...inputProps}
                    ref={(el) => {
                      (inputProps as any).ref.current = el;
                      ref.current = el;
                    }}
                  />
                  {isDragActive ? (
                    <p>Drop the files here ...</p>
                  ) : (
                    <p>
                      Drag 'n' drop some files here, or click to select files
                    </p>
                  )}
                </div>
              </Box>
            )
          )}

          {files?.length && !submitting && (
            <Box mt={3}>
              <Typography variant="h6">Selected Files:</Typography>
              {Array.from(files)
                .map((file) => file.name)
                .join(", ")}

              {invalidFileNames && (
                <Box marginY={2}>
                  <Alert severity="error">
                    Max. length for file names is 20 chars
                  </Alert>
                </Box>
              )}
              <Box mt={2}>
                <Button variant="contained" onClick={() => setFiles(undefined)}>
                  Reset
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={submitting} onClick={handleClose}>
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!filesDropped || invalidFileNames || submitting}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbardClose}
      >
        <Alert onClose={handleSnackbardClose} severity="error">
          Error uploading file. Please try again
        </Alert>
      </Snackbar>
    </>
  );
};
