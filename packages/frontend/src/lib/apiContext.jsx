import { createContext, useContext } from "react";

const ApiContext = createContext(null);
export const ApiProvider = ApiContext.Provider;
export const useApi = () => useContext(ApiContext);
