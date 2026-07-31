/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    /**
     * URLs locais com query string (ex.: /api/file?pathname=...) exigem
     * localPatterns no Next 15+. Sem isso o otimizador rejeita a imagem
     * e o checkout/carrinho mostram o ícone quebrado.
     * `search` omitido = qualquer query permitida nesse pathname.
     */
    localPatterns: [
      {
        pathname: "/api/file",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
