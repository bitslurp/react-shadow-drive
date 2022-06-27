import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import React, { FunctionComponent } from "react";
import { Controller, useForm } from "react-hook-form";
import type { StorageAccountInfo } from "react-shadow-drive";

export type AccountFormProps = {
  onSubmit: (data: StorageAccountInfo) => void;
};

export const StorageAccountForm: FunctionComponent<AccountFormProps> = ({
  onSubmit,
}) => {
  const { control, handleSubmit } = useForm<StorageAccountInfo>({
    defaultValues: {
      accountName: "",
      storageSpace: "",
      storageUnit: "MB",
    },
  });
  return (
    <form id="storage-account-form" onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="accountName"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            sx={{ marginRight: 3 }}
            label="Folder Name"
            variant="standard"
          />
        )}
      />

      <Controller
        name="storageSpace"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            type="number"
            label="Storage Space"
            variant="standard"
          />
        )}
      />

      <Controller
        name="storageUnit"
        control={control}
        render={({ field }) => (
          <FormControl variant="standard">
            <InputLabel id="demo-simple-select-label">Unit</InputLabel>
            <Select labelId="demo-simple-select-label" label="Unit" {...field}>
              <MenuItem value="KB">kb</MenuItem>
              <MenuItem value="MB">mb</MenuItem>
              <MenuItem value="GB">gb</MenuItem>
            </Select>
          </FormControl>
        )}
      />
    </form>
  );
};
