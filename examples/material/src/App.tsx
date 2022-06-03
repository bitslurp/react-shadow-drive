import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import React from "react";
import "./App.scss";
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
        <div className="app">
          <header className="app__header">
            <WalletMultiButton />
            <WalletDisconnectButton />
          </header>

          <div className="app__content">
            <ShadowDriveFileManager />
          </div>
        </div>
      </Wallet>
    </ThemeProvider>
  );
}

export default App;
