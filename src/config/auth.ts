const token = process.env.KRONOS_ACCESS_TOKEN?.trim();

export function getKronosAccessToken(): string {
  if (!token) {
    throw new Error(
      "KRONOS_ACCESS_TOKEN no está configurado."
    );
  }

  return token;
}
