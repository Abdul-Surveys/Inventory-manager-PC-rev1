import axios from "axios";

// When REACT_APP_BACKEND_URL is empty (self-hosted, same-origin behind a reverse
// proxy), API becomes "/api" and calls go to the current origin. When it is set
// (e.g. a dedicated backend URL), absolute URLs are used.
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const getErrorMessage = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  return err?.message || "Something went wrong";
};

export const downloadReport = (path, params = {}) => {
  // Use window.location.origin as the base so a relative API ("/api") works same-origin.
  const url = new URL(`${API}${path}`, window.location.origin);
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
