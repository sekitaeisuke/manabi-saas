import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // 顔認識モデル（約12MB・中身は変わらない）。既定だと毎回落とし直すので
        // カメラが立ち上がるまで待たされる。1年キャッシュさせる。
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
