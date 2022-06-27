import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import React from "react";
import { ShadowDriveFileManager } from "./components/ShadowDriveFileManager/ShadowDriveFileManager";
import { Wallet } from "./Wallet";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Wallet>
        <ShadowDriveFileManager />
      </Wallet>
    </ThemeProvider>
  );
}

export default App;
