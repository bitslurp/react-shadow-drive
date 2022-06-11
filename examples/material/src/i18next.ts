import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fileManager from "./components/ShadowDriveFileManager/i18n/en.json";

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources: {
      en: { translation: { ...fileManager } },
    },
    lng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
