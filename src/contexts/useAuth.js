import { useContext } from "react";
import { AuthContext } from "./AuthContext";

// Important: keeping this hook in a separate file satisfies react-refresh lint rules.
export const useAuth = () => useContext(AuthContext);
