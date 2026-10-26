import { apiRequest } from "./apiClient.js";

export function login(credentials) {
  return apiRequest("/api/login", {
    method: "POST",
    body: credentials,
  });
}

export function register(user) {
  return apiRequest("/api/register", {
    method: "POST",
    body: user,
  });
}
