// vite.config.ts
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
var cloudflareWasmModule = {
  name: "cloudflare-wasm-module",
  enforce: "pre",
  resolveId(id) {
    if (id.includes(".wasm") && id.endsWith("?module")) {
      return {
        id: "../../app/db/internal/query_compiler_fast_bg.wasm?module",
        external: true
      };
    }
  }
};
var vite_config_default = defineConfig((config) => {
  return {
    resolve: {
      alias: config.mode === "development" ? {
        "~/db.server": path.resolve(
          process.cwd(),
          "app/db.local.server.ts"
        )
      } : void 0
    },
    ssr: {
      resolve: {
        conditions: ["workerd", "browser"],
        externalConditions: ["workerd", "browser"]
      }
    },
    server: {
      port: 3003
    },
    plugins: [
      cloudflareWasmModule,
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
      devtoolsJson()
    ]
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlUm9vdCI6ICJmaWxlOi8vL3Nlc3Npb25zL3dpemFyZGx5LWJyYXZlLWRhdmluY2kvbW50L3RhYmxlZGVjay9zY29yZWJvYXJkLyIsCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL3Nlc3Npb25zL3dpemFyZGx5LWJyYXZlLWRhdmluY2kvbW50L3RhYmxlZGVjay9zY29yZWJvYXJkXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvd2l6YXJkbHktYnJhdmUtZGF2aW5jaS9tbnQvdGFibGVkZWNrL3Njb3JlYm9hcmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL3dpemFyZGx5LWJyYXZlLWRhdmluY2kvbW50L3RhYmxlZGVjay9zY29yZWJvYXJkL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0IHR5cGUgeyBQbHVnaW4gfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHsgcmVhY3RSb3V0ZXIgfSBmcm9tIFwiQHJlYWN0LXJvdXRlci9kZXYvdml0ZVwiO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCB0c2NvbmZpZ1BhdGhzIGZyb20gXCJ2aXRlLXRzY29uZmlnLXBhdGhzXCI7XG5pbXBvcnQgZGV2dG9vbHNKc29uIGZyb20gXCJ2aXRlLXBsdWdpbi1kZXZ0b29scy1qc29uXCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5cbi8vIFByaXNtYSA3IGdlbmVyYXRlcyA/bW9kdWxlIFdBU00gaW1wb3J0cyAoQ2xvdWRmbGFyZSBXb3JrZXJzIHN5bnRheCkuXG4vLyBWaXRlIGNhbid0IHBhcnNlIHRoZW0gXHUyMDE0IG1hcmsgdGhlbSBleHRlcm5hbCBzbyB3cmFuZ2xlciBoYW5kbGVzIHRoZW0gaW5zdGVhZC5cbmNvbnN0IGNsb3VkZmxhcmVXYXNtTW9kdWxlOiBQbHVnaW4gPSB7XG4gIG5hbWU6IFwiY2xvdWRmbGFyZS13YXNtLW1vZHVsZVwiLFxuICBlbmZvcmNlOiBcInByZVwiLFxuICByZXNvbHZlSWQoaWQpIHtcbiAgICBpZiAoaWQuaW5jbHVkZXMoXCIud2FzbVwiKSAmJiBpZC5lbmRzV2l0aChcIj9tb2R1bGVcIikpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiBcIi4uLy4uL2FwcC9kYi9pbnRlcm5hbC9xdWVyeV9jb21waWxlcl9mYXN0X2JnLndhc20/bW9kdWxlXCIsXG4gICAgICAgIGV4dGVybmFsOiB0cnVlLFxuICAgICAgfTtcbiAgICB9XG4gIH0sXG59O1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKGNvbmZpZykgPT4ge1xuICByZXR1cm4ge1xuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOlxuICAgICAgICBjb25maWcubW9kZSA9PT0gXCJkZXZlbG9wbWVudFwiXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIFwifi9kYi5zZXJ2ZXJcIjogcGF0aC5yZXNvbHZlKFxuICAgICAgICAgICAgICAgIHByb2Nlc3MuY3dkKCksXG4gICAgICAgICAgICAgICAgXCJhcHAvZGIubG9jYWwuc2VydmVyLnRzXCIsXG4gICAgICAgICAgICAgICksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgfSxcbiAgICBzc3I6IHtcbiAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgY29uZGl0aW9uczogW1wid29ya2VyZFwiLCBcImJyb3dzZXJcIl0sXG4gICAgICAgIGV4dGVybmFsQ29uZGl0aW9uczogW1wid29ya2VyZFwiLCBcImJyb3dzZXJcIl0sXG4gICAgICB9LFxuICAgIH0sXG4gICAgc2VydmVyOiB7XG4gICAgICBwb3J0OiAzMDAzLFxuICAgIH0sXG4gICAgcGx1Z2luczogW1xuICAgICAgY2xvdWRmbGFyZVdhc21Nb2R1bGUsXG4gICAgICB0YWlsd2luZGNzcygpLFxuICAgICAgcmVhY3RSb3V0ZXIoKSxcbiAgICAgIHRzY29uZmlnUGF0aHMoKSxcbiAgICAgIGRldnRvb2xzSnNvbigpLFxuICAgIF0sXG4gIH07XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlYsT0FBTyxVQUFVO0FBRTlXLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sbUJBQW1CO0FBQzFCLE9BQU8sa0JBQWtCO0FBQ3pCLE9BQU8saUJBQWlCO0FBSXhCLElBQU0sdUJBQStCO0FBQUEsRUFDbkMsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLEVBQ1QsVUFBVSxJQUFJO0FBQ1osUUFBSSxHQUFHLFNBQVMsT0FBTyxLQUFLLEdBQUcsU0FBUyxTQUFTLEdBQUc7QUFDbEQsYUFBTztBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osVUFBVTtBQUFBLE1BQ1o7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhLENBQUMsV0FBVztBQUN0QyxTQUFPO0FBQUEsSUFDTCxTQUFTO0FBQUEsTUFDUCxPQUNFLE9BQU8sU0FBUyxnQkFDWjtBQUFBLFFBQ0UsZUFBZSxLQUFLO0FBQUEsVUFDbEIsUUFBUSxJQUFJO0FBQUEsVUFDWjtBQUFBLFFBQ0Y7QUFBQSxNQUNGLElBQ0E7QUFBQSxJQUNSO0FBQUEsSUFDQSxLQUFLO0FBQUEsTUFDSCxTQUFTO0FBQUEsUUFDUCxZQUFZLENBQUMsV0FBVyxTQUFTO0FBQUEsUUFDakMsb0JBQW9CLENBQUMsV0FBVyxTQUFTO0FBQUEsTUFDM0M7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUjtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1A7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxNQUNkLGFBQWE7QUFBQSxJQUNmO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
