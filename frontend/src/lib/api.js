import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const getErrorMessage = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  return err?.message || "Something went wrong";
};

export const downloadReport = (path, params = {}) => {
  const url = new URL(`${API}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "all") url.searchParams.set(k, v);
  });
  const a = document.createElement("a");
  a.href = url.toString();
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
};
