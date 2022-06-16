import i18n from "i18next";
import Fetch from "i18next-fetch-backend";
import { initReactI18next } from "react-i18next";

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .use(Fetch)
  .init({
    backend: {
      loadPath: "/{{lng}}.json",
    },
    lng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });
