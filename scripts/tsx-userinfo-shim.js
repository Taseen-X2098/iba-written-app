// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("node:os");

try {
  os.userInfo();
} catch {
  // tsx uses only the username to create a per-user temporary directory.
  // Some restricted Windows environments cannot call uv_os_get_passwd.
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || process.env.USER || "local",
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: null,
  });
}
