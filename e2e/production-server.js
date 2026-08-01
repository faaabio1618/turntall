import { preview } from "vite";

export default async function startProductionPreview() {
  const server = await preview({
    preview: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
    },
  });

  return async () => {
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };
}
