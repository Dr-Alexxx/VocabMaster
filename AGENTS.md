# VocabMaster Agent 工作流

## 安卓构建（必读）

运行 `npm run build:android` / `npm run build:android:release` 时，**必须**设置完成检测或超时检测，防止 gradle 守护进程挂起卡住 session：

1. **显式超时**：bash 调用必须带 `timeout`（建议 900000ms = 15min），禁止无限等待。
2. **完成检测**：构建后以产物判定完成，而不是以进程退出判定——检查 `android\app\build\outputs\apk\release\app-release.apk` 存在且时间戳更新，并 grep 输出确认 `BUILD SUCCESSFUL`。
3. **清理守护进程**：构建结束后杀掉残留 gradle daemon，避免后续命令被占用：
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
     Where-Object { $_.CommandLine -match 'gradle' } |
     ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
   ```
4. **卡住的判定**：若 gradle 输出停在 `BUILD SUCCESSFUL` 之后但命令未返回，视为守护进程残留，直接按第 3 步清理后继续收尾（如 `npm run pack:apk`），不要重跑整个构建。

## 已知环境陷阱

- **后台进程会被执行器回收**：不要用 `Start-Process`/`cmd /c start /b` 留后台服务（报 `ChildProcess.kill`）。
- **vite dev server 会挡住 rename**：跑 `build:win` 前确认没有 `vite.js` 进程（watcher 持有 `release\win-unpacked.tmp` 目录句柄导致 electron-builder EPERM rename 失败）。清理：`Stop-Process` 匹配 `vite` 的 node 进程。
- **git 幻影 M 状态**（行尾）：`git diff --numstat` 为空时用 `git restore .` 清掉。
- **构建前置**：安卓构建需设 `$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.5.11-hotspot"`。

## 提交约定

- 直接提交并推送到 `main`（已获用户授权）。
- 提交信息用英文祈使句。
