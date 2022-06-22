import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./static/en.json";

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  // .use(Fetch)
  .init({
    resources: {
      en: {
        translation: en,
      },
    },
    lng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
