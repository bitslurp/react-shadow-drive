import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import React, { FunctionComponent } from "react";
import { Controller, useForm } from "react-hook-form";
import type { StorageAccountData } from "react-shadow-drive";

export type AccountFormProps = {
  onSubmit: (data: StorageAccountData) => void;
  splTokenSelect?: boolean;
  spaceOnly?: boolean;
};

export const StorageAccountForm: FunctionComponent<AccountFormProps> = ({
  spaceOnly,
  splTokenSelect,
  onSubmit,
}) => {
  const { control, handleSubmit } = useForm<StorageAccountData>({
    defaultValues: {
      accountName: "",
      storageSpace: "",
      storageUnit: "MB",
      paymentToken: "SHDW",
    },
  });
  return (
    <form id="storage-account-form" onSubmit={handleSubmit(onSubmit)}>
      <Box mb={4}>
        {!spaceOnly && (
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
        )}

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
              <InputLabel id="unit-select-label">Unit</InputLabel>
              <Select labelId="unit-select-label" label="Unit" {...field}>
                <MenuItem value="KB">kb</MenuItem>
                <MenuItem value="MB">mb</MenuItem>
                <MenuItem value="GB">gb</MenuItem>
              </Select>
            </FormControl>
          )}
        />
      </Box>

      {splTokenSelect && (
        <Controller
          name="paymentToken"
          control={control}
          render={({ field }) => (
            <FormControl variant="standard" sx={{ minWidth: "150px" }}>
              <InputLabel id="payment-token-label">Payment Token</InputLabel>
              <Select
                labelId="payment-token-label"
                label="Payment Token"
                {...field}
              >
                <MenuItem value="SHDW">SHDW</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
                <MenuItem value="USDC">USDC</MenuItem>
              </Select>
            </FormControl>
          )}
        />
      )}
    </form>
  );
};
