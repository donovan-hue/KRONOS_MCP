const apiUrl = process.env.KRONOS_API_URL;

if (apiUrl && !/^https:\/\//i.test(apiUrl)) {
  throw new Error("KRONOS_API_URL debe usar HTTPS.");
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  KRONOS_API_URL: (apiUrl || "https://api.kronos-space.com").replace(/\/+$/, ""),
};
